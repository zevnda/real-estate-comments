// Turns ShitRentals' property reviews (an Airtable base; using them needs the owner's permission) into comments in our format,
// or says why one can't be used. Pure functions, tested in tests/shitrentals.test.ts. See CLAUDE.md → "ShitRentals
// reviews".
// Only modules without imports of their own (property.ts, shitrentals.ts) can be imported here: Node runs this
// directly, and the other shared modules use extensionless imports that only the bundler resolves
import { canonicalAddress, isStreetType, STATES } from '../../src/shared/property.ts'
import { SHITRENTALS_SOURCE as SOURCE } from '../../src/shared/shitrentals.ts'

// As in src/shared/validation.ts (tests/shitrentals.test.ts checks they match)
export const COMMENT_MIN_LENGTH = 5
export const COMMENT_MAX_LENGTH = 1200

export const USERNAME = 'ShitRentals'
export const MAX_IMAGES = 4
// Each review's own page in the shared base
const RECORD_URL = 'https://airtable.com/app5nuiBfQvyyqojK/shrcYJ6DOxDdiBuDE/tblxFlCLXImh1mJZT/viw8OVdGvnj7I82ON/'

export interface SourceImage {
  id: string
  type: string
  // Airtable's large thumbnail (about 683 × 512, JPEG even for HEIC photos)
  width?: number
  height?: number
}

// A review as read from Airtable, with only the fields we use
export interface SourceRecord {
  id: string
  address: string
  suburb: string
  state: string
  country: string
  review: string
  submittedAt: string
  images: SourceImage[]
}

export interface Locality {
  name: string
  state: string
  postcode: string
  lat: number
  lng: number
}

// "suburb|state" → its delivery areas (more than one when a postcode boundary splits it, or two places share a name)
export type PostcodeIndex = Map<string, Locality[]>

// Hand fixes, by record ID, for reviews the parser gets wrong or can't place (scripts/shitrentals/overrides.json)
export interface Override {
  address?: string
  suburb?: string
  postcode?: string
  // Leave the review out; the value says why
  skip?: string
}

export interface ImportedComment {
  // Document ID in listingcomments, so each sync updates the same document
  id: string
  address: string
  suburb: string
  state: string
  postcode?: string
  url: string
  text: string
  username: string
  uid: string
  createdAt: string
  source: typeof SOURCE
  sourceId: string
  images: { id: string; width?: number; height?: number }[]
}

export type SkipReason =
  | 'not in Australia'
  | 'override'
  | 'review too short'
  | 'no suburb'
  | 'suburb not found'
  | 'no street number'
  | 'several units'
  | 'lot number'
  | 'no street type'
  | 'unclear address'

export type ParseResult =
  { ok: true; comment: ImportedComment; notes: string[] } | { ok: false; reason: SkipReason; detail: string }

export function parseRecord(record: SourceRecord, index: PostcodeIndex, override: Override = {}): ParseResult {
  const skip = (reason: SkipReason, detail: string): ParseResult => ({ ok: false, reason, detail })
  if (override.skip) return skip('override', override.skip)
  if (record.country !== 'Australia') return skip('not in Australia', record.country || '(none)')
  if (record.review.trim().length < COMMENT_MIN_LENGTH) return skip('review too short', record.review.trim())

  const state = record.state.toLowerCase()
  const rawSuburb = override.suburb ?? record.suburb
  if (!rawSuburb.trim() || !(STATES as readonly string[]).includes(state)) return skip('no suburb', rawSuburb)

  const rawAddress = override.address ?? record.address
  const locality = resolveLocality(rawSuburb, state, index, [
    ...(override.postcode ? [override.postcode] : []),
    ...postcodesIn(rawAddress),
  ])
  if (!locality.ok) return skip(locality.reason, `${rawSuburb.trim()} ${record.state}`)

  const address = cleanAddress(rawAddress, [locality.suburb, normalizeSuburb(rawSuburb).name])
  if (!address.ok) return skip(address.reason, rawAddress.trim())

  // Photos only, and only those Airtable made a thumbnail for (it couldn't for a few files; they have no size)
  const images = record.images
    .filter(image => image.type.startsWith('image/') && image.width)
    .slice(0, MAX_IMAGES)
    .map(({ id, width, height }) => ({ id, width, height }))
  const url = RECORD_URL + record.id
  return {
    ok: true,
    notes: [...locality.notes, ...address.notes],
    comment: {
      id: `sr_${record.id}`,
      address: address.address,
      suburb: locality.suburb,
      state,
      ...(locality.postcode ? { postcode: locality.postcode } : {}),
      url,
      text: commentText(record.review, url),
      username: USERNAME,
      uid: SOURCE,
      createdAt: record.submittedAt,
      source: SOURCE,
      sourceId: record.id,
      images,
    },
  }
}

// ── Suburb and postcode ─────────────────────────────────────────────────────────────────────────────────────────────

// Delivery areas sharing a name this close together are one suburb split between postcodes (Melbourne 3000/3004);
// further apart they're different places (Darlington NSW 2008 in Sydney, 2330 in the Hunter)
const SAME_PLACE_KM = 15

type LocalityResult =
  { ok: true; suburb: string; postcode?: string; notes: string[] } | { ok: false; reason: 'suburb not found' }

export function resolveLocality(raw: string, state: string, index: PostcodeIndex, hints: string[]): LocalityResult {
  const { name, postcode } = normalizeSuburb(raw)
  const known = [...new Set([...(postcode ? [postcode] : []), ...hints])]
  const pick = (suburb: string, areas: Locality[], notes: string[]) => pickPostcode(suburb, state, areas, known, notes)
  const exact = index.get(`${name}|${state}`)
  if (exact) return pick(name, exact, [])

  // Misspelt ("oakliegh", "stkilda"): the one locality in the state within a small edit distance. With a postcode in
  // the text, only localities with that postcode are considered, and a larger distance is allowed.
  const candidates = [...index.values()]
    .flat()
    .filter(locality => locality.state === state && (!known.length || known.includes(locality.postcode)))
  const squashed = name.replace(/[\s'-]/g, '')
  const allowed = known.length ? 3 : squashed.length >= 8 ? 2 : 1
  let best: Locality[] = []
  let bestDistance = Infinity
  for (const locality of candidates) {
    const distance = editDistance(squashed, locality.name.replace(/[\s'-]/g, ''))
    if (distance > allowed || distance > bestDistance) continue
    if (distance < bestDistance) best = []
    bestDistance = distance
    best.push(locality)
  }
  const names = new Set(best.map(locality => locality.name))
  if (names.size === 1) {
    const corrected = best[0]!.name
    return pick(corrected, index.get(`${corrected}|${state}`) ?? best, [
      `suburb corrected: "${raw.trim()}" → "${corrected}"`,
    ])
  }

  // Two suburbs or extra words: "west ryde/ermington", "shalvey, mt druitt", "soldiers hill ballarat"
  for (const part of raw.split(/[/,]/)) {
    const words = normalizeSuburb(part).name.split(' ')
    for (let end = words.length; end > 0; end--) {
      const shorter = words.slice(0, end).join(' ')
      const areas = shorter !== name ? index.get(`${shorter}|${state}`) : undefined
      if (areas) return pick(shorter, areas, [`suburb taken as "${shorter}" from "${raw.trim()}"`])
    }
  }
  return { ok: false, reason: 'suburb not found' }
}

function pickPostcode(
  suburb: string,
  state: string,
  areas: Locality[],
  known: string[],
  notes: string[],
): LocalityResult {
  const postcodes = [...new Set(areas.map(area => area.postcode))]
  if (postcodes.length === 1) return { ok: true, suburb, postcode: postcodes[0], notes }
  const stated = postcodes.find(postcode => known.includes(postcode))
  if (stated) return { ok: true, suburb, postcode: stated, notes }
  // Stored without a postcode, which the lookup matches with any: a wrong one would hide the review on its own listing
  // (comments whose postcode differs are dropped). Either one suburb split between postcodes, or two places with the
  // same name (Enmore NSW: Sydney and Armidale), where a wrong match needs the same street and number in both.
  const spread = Math.max(...areas.flatMap(a => areas.map(b => distanceKm(a, b))))
  const why = spread > SAME_PLACE_KM ? 'places with this name' : 'postcodes'
  const note = `no postcode: ${suburb} ${state.toUpperCase()} has ${postcodes.length} ${why} (${postcodes.join(', ')})`
  return { ok: true, suburb, notes: [...notes, note] }
}

// Lowercase, single-spaced, with a typed state or postcode taken off ("Brunswick 3056", "Malvern East VIC 3145")
export function normalizeSuburb(raw: string): { name: string; postcode?: string } {
  let text = raw
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\([^)]*\)?/g, ' ')
  const postcode = text.match(/\b(\d{4})\b/)?.[1]
  text = text.replace(/\b\d{4}\b/g, ' ').replace(new RegExp(`\\b(${STATES.join('|')})\\b`, 'g'), ' ')
  text = text.replace(/[^a-z' -]/g, ' ').replace(/\bmt\b/g, 'mount')
  return { name: collapse(text), ...(postcode ? { postcode } : {}) }
}

function postcodesIn(text: string): string[] {
  return [...text.matchAll(/\b(\d{4})\s*$/g)].map(match => match[1]!)
}

function distanceKm(a: Locality, b: Locality): number {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371
}

// Australia Post localities (CSV from github.com/matthewproctor/australianpostcodes), delivery areas only: PO boxes
// and large-volume recipients have their own postcodes that no home uses
export function buildPostcodeIndex(csv: string): PostcodeIndex {
  const [header, ...lines] = csv.split(/\r?\n/)
  const columns = parseCsvLine(header ?? '')
  const at = (name: string) => columns.indexOf(name)
  const [postcodeAt, localityAt, stateAt, typeAt, latAt, lngAt] = [
    'postcode',
    'locality',
    'state',
    'type',
    'lat',
    'long',
  ]
    .map(at)
    .map(index => (index < 0 ? Infinity : index)) as [number, number, number, number, number, number]
  if ([postcodeAt, localityAt, stateAt, typeAt].includes(Infinity)) throw new Error('Unexpected postcode CSV columns')

  const index: PostcodeIndex = new Map()
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = parseCsvLine(line)
    if (cells[typeAt] !== 'Delivery Area') continue
    const locality: Locality = {
      name: collapse(cells[localityAt]!.toLowerCase()),
      state: cells[stateAt]!.toLowerCase(),
      postcode: cells[postcodeAt]!,
      lat: Number(cells[latAt]),
      lng: Number(cells[lngAt]),
    }
    const key = `${locality.name}|${locality.state}`
    index.set(key, [...(index.get(key) ?? []), locality])
  }
  return index
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') cell += line[++i]
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells
}

// ── Street address ──────────────────────────────────────────────────────────────────────────────────────────────────

// Street types our STREET_TYPES doesn't list. They stay as written, which is how the sites write them too.
const MORE_STREET_TYPES = new Set(
  (
    'boulevarde brace bend chase circus common concourse cove crest crossing dale downs edge entrance fairway gate ' +
    'gateway glade glen green grange heights hill hollow junction link loop lookout mall meander mews nook outlook ' +
    'park pass path pathway plaza point quay reach retreat rise rotary round row run serpentine spur strand trail ' +
    'turn vale view vista walk walkway waters wharf wynd'
  ).split(' '),
)
const DIRECTIONS: Record<string, string> = { north: 'north', south: 'south', east: 'east', west: 'west' }
const DIRECTION_LETTERS: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west' }
// Streets named only by their type: "186 broadway", "12 esplanade west"
const NAMED_BY_TYPE = new Set(['broadway', 'esplanade', 'strand', 'boulevard', 'boulevarde', 'promenade'])
const NUMBER = String.raw`[a-z]{0,2}\d+[a-z]?`
const STREET_NUMBER = `${NUMBER}(?:-${NUMBER})?`
// The unit may be letters only: "b/44 enchanted circuit"
const UNIT = String.raw`(?:${NUMBER}|[a-z]{1,2})/`
const ADDRESS = new RegExp(String.raw`^(?:${UNIT})?${STREET_NUMBER}(?: [a-z][a-z'-]*)+$`)

type AddressResult =
  | { ok: true; address: string; notes: string[] }
  | { ok: false; reason: 'no street number' | 'several units' | 'lot number' | 'no street type' | 'unclear address' }

// The street address in our canonical form ("3/39 new canterbury road"), from what the reviewer typed
export function cleanAddress(raw: string, suburbs: string[]): AddressResult {
  const notes: string[] = []
  let text = collapse(
    raw
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/\([^)]*\)?/g, ' ')
      // "st.kilda rd" → "st kilda rd" (canonicalAddress drops full stops, which would join the words)
      .replace(/\.(?=[a-z])/g, ' '),
  )
  if (/^(?:units|all units|lot)\b/.test(text)) {
    return { ok: false, reason: text.startsWith('lot') ? 'lot number' : 'several units' }
  }

  // Locality typed after the street: "…, edwardstown", "… hawthorn 3122", "… ascot qld australia"
  const names = suburbs.filter(Boolean).map(escapeRegExp)
  const tail = new RegExp(String.raw`[\s,]+(?:australia|${[...STATES, ...names].join('|')}|\d{4})$`)
  for (let previous = ''; previous !== text;) {
    previous = text
    text = text.replace(/[\s,.]+$/, '').replace(tail, '')
  }

  const unitWords = 'unit|u|apartment|apt|flat|villa|townhouse|suite'
  text = text
    .replace(/\b(?:no\.?|number)\s+(?=\d)/g, '')
    // "unit 3 39 x", "u g1 355 x", "unit a502, 24 x" → "3/39 x"
    .replace(new RegExp(String.raw`^(?:${unitWords})\s*(${NUMBER})[\s,/]+(${STREET_NUMBER})\s`), '$1/$2 ')
    // "11 8-10 cowper street", "g03 266 pitt st", "2, 480 station st": a unit number without the slash
    .replace(new RegExp(String.raw`^(${NUMBER})[\s,]+(${STREET_NUMBER})\s+(?=[a-z])`), '$1/$2 ')
  // The street number typed twice: "9b 9b llewellyn street"
  text = canonicalAddress(text).replace(/^([^/ ]+)\/\1 /, '$1 ')

  if (!new RegExp(String.raw`^(?:${UNIT})?[a-z]{0,2}\d`).test(text)) return { ok: false, reason: 'no street number' }
  if (!ADDRESS.test(text)) return { ok: false, reason: 'unclear address' }

  const words = text.split(' ')
  let typeAt = words.length - 1
  // "jersey st n" → "jersey street north", as the sites write it
  const last = words[typeAt]!
  if (typeAt > 1 && (DIRECTIONS[last] ?? DIRECTION_LETTERS[last])) {
    words[typeAt] = DIRECTIONS[last] ?? DIRECTION_LETTERS[last]!
    typeAt--
  }
  const type = words[typeAt]!
  if (typeAt === 1 && NAMED_BY_TYPE.has(type)) return { ok: true, address: words.join(' '), notes }
  if (!isKnownType(type)) {
    // A misspelt type: "cresent", "bouelvard"
    const fixed = typeAt >= 2 && type.length >= 5 ? closestType(type) : null
    if (!fixed) return { ok: false, reason: 'no street type' }
    words[typeAt] = fixed
    notes.push(`street type corrected: "${type}" → "${fixed}"`)
  }
  if (typeAt < 2) return { ok: false, reason: 'no street type' }
  return { ok: true, address: canonicalAddress(words.join(' ')), notes }
}

function isKnownType(word: string): boolean {
  return isStreetType(word) || MORE_STREET_TYPES.has(word)
}

const FULL_TYPES = [
  ...['street', 'road', 'avenue', 'drive', 'place', 'court', 'crescent', 'parade', 'terrace', 'close', 'highway'],
  ...['boulevard', 'esplanade', 'circuit', 'grove', 'lane', 'square', 'promenade', 'parkway', 'gardens', 'approach'],
]

function closestType(word: string): string | null {
  const close = FULL_TYPES.filter(type => editDistance(word, type) === 1)
  return close.length === 1 ? close[0]! : null
}

// ── Comment text ────────────────────────────────────────────────────────────────────────────────────────────────────

// The review as comment markdown, cut to fit our comment length with a link to the whole review. The link is always
// there, so the review is credited even where the extension doesn't show the ShitRentals badge (older versions).
export function commentText(review: string, url: string): string {
  const body = escapeMarkdown(
    review
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
  const whole = `${body}\n\n[View on ShitRentals →](${url})`
  if (whole.length <= COMMENT_MAX_LENGTH) return whole
  const link = `\n\n[View more on ShitRentals →](${url})`
  const cut = truncate(body, COMMENT_MAX_LENGTH - link.length - 1)
  // "…" only when cut mid-sentence; after a full stop the link says there's more
  return `${cut}${/[.!?]$/.test(cut) ? '' : '…'}${link}`
}

// Cut at the end of a sentence if there's one in the last quarter, otherwise at a space
function truncate(text: string, max: number): string {
  const cut = text.slice(0, max)
  const sentence = Math.max(...['. ', '! ', '? ', '\n'].map(end => cut.lastIndexOf(end)))
  const at = sentence >= max * 0.75 ? sentence + 1 : cut.lastIndexOf(' ') > max * 0.5 ? cut.lastIndexOf(' ') : max
  // Don't leave half of an escape behind
  return cut.slice(0, at).replace(/\\+$/, '').trimEnd()
}

// Reviews are plain text: stop markdown reading "*", "_", "#" and the like as formatting. Lists ("1.", "- ") are left
// alone, since reviewers write them as lists.
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_[\]<>~|]/g, '\\$&')
    .replace(/^(\s*)#/gm, '$1\\#')
    .replace(/^(\s*)(=+|-{3,})\s*$/gm, '$1\\$2')
}

// Damerau-Levenshtein (optimal string alignment) distance, as in src/shared/search.ts
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, rows[i - 2]![j - 2]! + 1)
      rows[i]![j] = value
    }
  }
  return rows[a.length]![b.length]!
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
