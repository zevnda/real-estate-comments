import { importPKCS8, SignJWT } from 'jose'

// A small Firestore REST client: the relay only reads single documents and commits writes. It signs in as a service
// account, so the security rules don't apply to it; the relay does its own checks.

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }

export type Fields = Record<string, FirestoreValue>

export interface FirestoreDocument {
  fields: Record<string, unknown>
  updateTime: string
}

type Precondition = { exists: boolean } | { updateTime: string }

export type Write =
  | {
      update: { name: string; fields: Fields }
      // Only these fields are changed; without it, the document is replaced
      updateMask?: { fieldPaths: string[] }
      currentDocument?: Precondition
      updateTransforms?: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[]
    }
  | { delete: string; currentDocument?: Precondition }

export interface CommitResult {
  commitTime: string
  writeResults: { updateTime?: string; transformResults?: FirestoreValue[] }[]
}

export interface Firestore {
  // The full resource name of a document, for writes
  name(path: string): string
  get(path: string): Promise<FirestoreDocument | null>
  // Documents in a collection whose timestamp `field` is before `before`, up to `limit`: their names (for deleting)
  // and last update times (as a precondition, so a document updated since isn't deleted)
  listBefore(
    collection: string,
    field: string,
    before: Date,
    limit: number,
  ): Promise<{ name: string; updateTime: string }[]>
  // Whether any document in a collection has `field` equal to `value` (or, for an array field, containing it)
  exists(collection: string, field: string, op: 'EQUAL' | 'ARRAY_CONTAINS', value: unknown): Promise<boolean>
  commit(writes: Write[]): Promise<CommitResult>
}

// `status` is Firestore's error status, e.g. FAILED_PRECONDITION when a write's precondition no longer holds
export class FirestoreError extends Error {
  override name = 'FirestoreError'
  readonly status: string
  constructor(message: string, status: string) {
    super(message)
    this.status = status
  }
}

export function createFirestore(options: {
  project: string
  token: () => Promise<string>
  // The Firestore emulator, for tests
  baseUrl?: string
}): Firestore {
  const root = `projects/${options.project}/databases/(default)/documents`
  const base = `${options.baseUrl ?? 'https://firestore.googleapis.com'}/v1/${root}`

  const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${await options.token()}`)
    if (init.body) headers.set('content-type', 'application/json')
    return fetch(url, { ...init, headers })
  }

  const fail = async (response: Response): Promise<never> => {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null
    throw new FirestoreError(
      `Firestore answered ${response.status}: ${body?.error?.message ?? response.statusText}`,
      body?.error?.status ?? 'UNKNOWN',
    )
  }

  return {
    name: path => `${root}/${path}`,

    async get(path) {
      const response = await request(`${base}/${path}`)
      if (response.status === 404) return null
      if (!response.ok) return fail(response)
      const document = (await response.json()) as { fields?: Fields; updateTime: string }
      return { fields: decodeFields(document.fields ?? {}), updateTime: document.updateTime }
    },

    async listBefore(collection, field, before, limit) {
      const response = await request(`${base}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: {
              fieldFilter: { field: { fieldPath: field }, op: 'LESS_THAN', value: encodeValue(before) },
            },
            limit,
          },
        }),
      })
      if (!response.ok) return fail(response)
      const results = (await response.json()) as { document?: { name: string; updateTime: string } }[]
      return results.flatMap(({ document }) =>
        document ? [{ name: document.name, updateTime: document.updateTime }] : [],
      )
    },

    async exists(collection, field, op, value) {
      const response = await request(`${base}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: { fieldFilter: { field: { fieldPath: field }, op, value: encodeValue(value) } },
            limit: 1,
          },
        }),
      })
      if (!response.ok) return fail(response)
      const results = (await response.json()) as { document?: unknown }[]
      return results.some(result => result.document)
    },

    async commit(writes) {
      const response = await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) })
      if (!response.ok) return fail(response)
      return (await response.json()) as CommitResult
    },
  }
}

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } }
  throw new TypeError(`Can't store a ${typeof value} in Firestore`)
}

export function encodeFields(data: Record<string, unknown>): Fields {
  const fields: Fields = {}
  for (const [key, value] of Object.entries(data)) if (value !== undefined) fields[key] = encodeValue(value)
  return fields
}

// Timestamps become Dates; integers become numbers (every integer the extension stores fits)
export function decodeValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return new Date(value.timestampValue)
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue)
  return decodeFields(value.mapValue.fields ?? {})
}

export function decodeFields(fields: Fields): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]))
}

interface ServiceAccount {
  client_email: string
  private_key: string
  private_key_id?: string
  token_uri?: string
}

// An OAuth access token for a service account key (the JSON file from the Google Cloud console), kept until shortly
// before it expires. Workers reuse an isolate for many requests, so this saves a token request on most posts.
export function serviceAccountToken(keyJson: string): () => Promise<string> {
  let cached: { token: string; expires: number } | null = null
  return async () => {
    if (cached && Date.now() < cached.expires) return cached.token
    const account = JSON.parse(keyJson) as ServiceAccount
    const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token'
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256', ...(account.private_key_id && { kid: account.private_key_id }) })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(account.private_key, 'RS256'))
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    })
    if (!response.ok) throw new Error(`Google refused the service account token (${response.status})`)
    const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number }
    cached = { token: access_token, expires: Date.now() + (expires_in - 300) * 1000 }
    return access_token
  }
}
