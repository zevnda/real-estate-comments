// Reads ShitRentals' Property Reviews from the base's public share link, with the same requests Airtable's own share
// page makes. They're undocumented and Airtable may change them; the official API (needs a token from the base's
// owner) is the sturdier option.
import type { SourceImage, SourceRecord } from './parse.ts'

const BASE = 'app5nuiBfQvyyqojK'
const SHARE_URL = `https://airtable.com/${BASE}/shrcYJ6DOxDdiBuDE`
const TABLE = 'tblxFlCLXImh1mJZT'
const VIEW = 'viw8OVdGvnj7I82ON'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

interface Column {
  id: string
  name: string
  type: string
  typeOptions?: { choices?: Record<string, { name: string }> }
}
interface Attachment {
  id: string
  type: string
  largeThumbUrl?: string
  largeThumbWidth?: number
  largeThumbHeight?: number
}
interface TableData {
  id: string
  rows: { id: string; createdTime: string; cellValuesByColumnId?: Record<string, unknown> }[]
  // Attachment URL → a signed URL that loads outside Airtable for a few hours (single-record requests only)
  signedUserContentUrls?: Record<string, string>
}
interface ShareData {
  data: { tableSchemas: { id: string; columns: Column[] }[]; tableDatas: TableData[] }
}

// A visit to the share page: its cookies, and the access policy the data requests need
export class ShareSession {
  private readonly headers: Record<string, string>
  private readonly tableUrl: string
  private readonly accessPolicy: string

  private constructor(headers: Record<string, string>, tableUrl: string, accessPolicy: string) {
    this.headers = headers
    this.tableUrl = tableUrl
    this.accessPolicy = accessPolicy
  }

  static async open(): Promise<ShareSession> {
    const page = await fetch(SHARE_URL, { headers: { 'user-agent': USER_AGENT } })
    if (!page.ok) throw new Error(`Share page: HTTP ${page.status}`)
    const html = await page.text()
    const prefetch = html.match(/urlWithParams: "([^"]+)"/)?.[1]
    if (!prefetch) throw new Error('Share page: no data URL found (Airtable may have changed the page)')
    // The page asks for msgpack; JSON is simpler and Airtable still serves it
    const tableUrl = (JSON.parse(`"${prefetch}"`) as string).replace(
      '%22allowMsgpackOfResult%22%3Atrue',
      '%22allowMsgpackOfResult%22%3Afalse',
    )
    const accessPolicy = new URL(tableUrl, 'https://airtable.com').searchParams.get('accessPolicy')
    if (!accessPolicy) throw new Error('Share page: no access policy found (Airtable may have changed the page)')
    const headers = {
      'user-agent': USER_AGENT,
      'cookie': page.headers
        .getSetCookie()
        .map(cookie => cookie.split(';')[0])
        .join('; '),
      'accept': 'application/json',
      'x-airtable-application-id': BASE,
      'x-airtable-inter-service-client': 'webClient',
      'x-airtable-page-load-id': html.match(/"x-airtable-page-load-id":"([^"]+)"/)?.[1] ?? '',
      'x-requested-with': 'XMLHttpRequest',
      'x-time-zone': 'Australia/Sydney',
      'x-user-locale': 'en',
    }
    return new ShareSession(headers, tableUrl, accessPolicy)
  }

  // Every review in the table
  async records(): Promise<SourceRecord[]> {
    return toRecords(await this.get(this.tableUrl))
  }

  // Working URLs for one review's large thumbnails (about 683 × 512, JPEG), by attachment ID. They expire within
  // hours, so download them straight away. The whole-table response has no signed URLs; this is the request the
  // share page sends when a review is opened.
  async thumbnails(recordId: string): Promise<Map<string, string>> {
    const params = new URLSearchParams({
      stringifiedObjectParams: JSON.stringify({
        includeDataForTableId: TABLE,
        includeDataForViewId: VIEW,
        includeDataForRowId: recordId,
        shouldIncludeSchemaChecksum: true,
      }),
      requestId: `req${Math.random().toString(36).slice(2, 16)}`,
      accessPolicy: this.accessPolicy,
    })
    const data = await this.get(`/v0.3/application/${BASE}/readForDetailView?${params}`)
    const table = data.data.tableDatas.find(table => table.id === TABLE)
    const images = imagesColumn(data)
    const row = table?.rows.find(row => row.id === recordId)
    const thumbnails = new Map<string, string>()
    for (const attachment of (row?.cellValuesByColumnId?.[images.id] ?? []) as Attachment[]) {
      const signed = attachment.largeThumbUrl && table?.signedUserContentUrls?.[attachment.largeThumbUrl]
      if (signed) thumbnails.set(attachment.id, signed)
    }
    return thumbnails
  }

  private async get(path: string): Promise<ShareData> {
    const response = await fetch(`https://airtable.com${path}`, { headers: this.headers })
    if (!response.ok) throw new Error(`Share data: HTTP ${response.status}`)
    return (await response.json()) as ShareData
  }
}

function columns(data: ShareData): Map<string, Column> {
  const schema = data.data.tableSchemas.find(table => table.id === TABLE)
  if (!schema) throw new Error('Share data: no Property Reviews table')
  return new Map(schema.columns.map(column => [column.name, column]))
}

function column(byName: Map<string, Column>, name: string): Column {
  const found = byName.get(name)
  if (!found) throw new Error(`Share data: no "${name}" field (the base's fields have changed)`)
  return found
}

function imagesColumn(data: ShareData): Column {
  return column(columns(data), 'Images')
}

function toRecords(data: ShareData): SourceRecord[] {
  const byName = columns(data)
  const rows = data.data.tableDatas.find(table => table.id === TABLE)?.rows
  if (!rows) throw new Error('Share data: no Property Reviews rows')
  const fields = {
    address: column(byName, 'Address'),
    suburb: column(byName, 'Suburb'),
    state: column(byName, 'State/City'),
    country: column(byName, 'Country'),
    review: column(byName, 'Review'),
    submitted: column(byName, 'Review Submitted'),
    images: column(byName, 'Images'),
  }
  const text = (cells: Record<string, unknown>, field: Column): string => {
    const value = cells[field.id]
    if (field.type === 'select' && typeof value === 'string') return field.typeOptions?.choices?.[value]?.name ?? ''
    return typeof value === 'string' ? value : ''
  }
  return rows.map(row => {
    const cells = row.cellValuesByColumnId ?? {}
    const attachments = (cells[fields.images.id] ?? []) as Attachment[]
    return {
      id: row.id,
      address: text(cells, fields.address),
      suburb: text(cells, fields.suburb),
      state: text(cells, fields.state),
      country: text(cells, fields.country),
      review: text(cells, fields.review),
      submittedAt: text(cells, fields.submitted) || row.createdTime,
      images: attachments.map((attachment): SourceImage => ({
        id: attachment.id,
        type: attachment.type,
        width: attachment.largeThumbWidth,
        height: attachment.largeThumbHeight,
      })),
    }
  })
}
