// Reviews reported comments. Starts a small server on your machine and opens a page listing open reports, where you can
// remove a comment (optionally banning its poster) or dismiss the reports. Uses the Firebase Admin SDK, which bypasses
// the security rules, with a service account key that never leaves your machine.
//
//   pnpm moderate
//
// Needs FIREBASE_SERVICE_ACCOUNT in .env: the path to a service account key (JSON) from the Firebase console →
// Project settings → Service accounts → Generate new private key. Keep the key out of the repo.
//
// The server only listens on 127.0.0.1, and every API call needs a random token from the URL it opens, so other
// websites open in your browser can't use it.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Timestamp } from 'firebase-admin/firestore'
import type { PropertyLinks } from '../src/shared/property.ts'

import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

import { canonicalAddress, propertyLinks, titleCase } from '../src/shared/property.ts'
import { reportReasonLabel } from '../src/shared/reports.ts'

const COMMENTS = 'listingcomments'
const REPORTS = 'reports'
const BANNED_USERS = 'bannedUsers'
const MAX_REPORTS = 500

type ReportStatus = 'open' | 'removed' | 'dismissed'
type Action = 'remove' | 'remove-ban' | 'dismiss'

interface ReportDoc {
  commentId: string
  reason: string
  details: string
  createdAt?: Timestamp
  // Set by this tool; reports from the extension have none (open)
  status?: Exclude<ReportStatus, 'open'>
  resolvedAt?: Timestamp
}

interface CommentDoc {
  address: string
  suburb: string
  state?: string
  postcode?: string
  text: string
  username?: string
  uid?: string
  createdAt?: Timestamp
  timestamp?: string
  votes?: number
}

// What the page gets: one entry per reported comment, with all its reports
interface ReportedComment {
  commentId: string
  open: boolean
  comment: {
    text: string
    username: string
    address: string
    locality: string
    links: PropertyLinks | null
    createdAt: number
    votes: number
    canBan: boolean
  } | null
  reports: {
    reason: string
    details: string
    createdAt: number
    status: ReportStatus
    resolvedAt: number | null
  }[]
}

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT
if (!keyPath || !existsSync(keyPath)) {
  console.error(
    keyPath
      ? `Service account key not found at ${keyPath}`
      : 'Set FIREBASE_SERVICE_ACCOUNT in .env to the path of a service account key (see .env.example).',
  )
  process.exit(1)
}

initializeApp({ credential: cert(keyPath) })
const db = getFirestore()
const token = randomBytes(24).toString('hex')
const page = readFileSync(new URL('./moderate.html', import.meta.url), 'utf8')

async function listReports(): Promise<ReportedComment[]> {
  const snapshot = await db.collection(REPORTS).orderBy('createdAt', 'desc').limit(MAX_REPORTS).get()
  const byComment = new Map<string, ReportDoc[]>()
  for (const doc of snapshot.docs) {
    const report = doc.data() as ReportDoc
    byComment.set(report.commentId, [...(byComment.get(report.commentId) ?? []), report])
  }
  if (!byComment.size) return []

  const refs = [...byComment.keys()].map(id => db.collection(COMMENTS).doc(id))
  const comments = await db.getAll(...refs)
  return comments.map(snap => {
    const reports = (byComment.get(snap.id) ?? []).map(report => ({
      reason: reportReasonLabel(report.reason),
      details: report.details,
      createdAt: report.createdAt?.toMillis() ?? 0,
      status: report.status ?? ('open' as const),
      resolvedAt: report.resolvedAt?.toMillis() ?? null,
    }))
    const data = snap.exists ? (snap.data() as CommentDoc) : null
    return {
      commentId: snap.id,
      open: reports.some(report => report.status === 'open'),
      comment: data && {
        text: data.text,
        username: data.username ?? 'Anonymous',
        address: titleCase(canonicalAddress(data.address)),
        locality: [titleCase(data.suburb), data.state?.toUpperCase(), data.postcode].filter(Boolean).join(' '),
        links:
          data.state && data.postcode
            ? propertyLinks({ address: data.address, suburb: data.suburb, state: data.state, postcode: data.postcode })
            : null,
        createdAt: data.createdAt?.toMillis() ?? (data.timestamp ? Date.parse(data.timestamp) : 0),
        votes: data.votes ?? 0,
        canBan: !!data.uid,
      },
      reports,
    }
  })
}

// Removes the comment (and with remove-ban, bans its poster) or dismisses the reports, and closes every open report
// on it. Reports are kept, marked with the outcome, as a record of how complaints were handled.
async function resolve(commentId: string, action: Action): Promise<void> {
  const commentRef = db.collection(COMMENTS).doc(commentId)
  const [comment, reports] = await Promise.all([
    commentRef.get(),
    db.collection(REPORTS).where('commentId', '==', commentId).get(),
  ])
  const batch = db.batch()
  if (action !== 'dismiss' && comment.exists) {
    if (action === 'remove-ban') {
      const uid = (comment.data() as CommentDoc).uid
      if (!uid) throw new Error('This comment has no user ID, so its poster can’t be banned.')
      // The extension looks bans up by `uid`; the other fields are for your reference
      batch.create(db.collection(BANNED_USERS).doc(), { uid, bannedAt: FieldValue.serverTimestamp(), commentId })
    }
    batch.delete(commentRef)
  }
  const status: ReportStatus = action === 'dismiss' ? 'dismissed' : 'removed'
  for (const report of reports.docs) {
    if ((report.data() as ReportDoc).status) continue
    batch.update(report.ref, { status, resolvedAt: FieldValue.serverTimestamp() })
  }
  await batch.commit()
}

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json') {
  response.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
  })
  response.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function hasToken(request: IncomingMessage): boolean {
  const given = Buffer.from(String(request.headers['x-token'] ?? ''))
  const expected = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 10_000) throw new Error('Request too large')
  }
  return JSON.parse(body) as unknown
}

const server = createServer((request, response) => {
  const { port } = server.address() as AddressInfo
  // Refuse anything not addressed to this server by IP (DNS rebinding)
  if (request.headers.host !== `127.0.0.1:${port}`) return send(response, 403, { error: 'Forbidden' })
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname

  if (request.method === 'GET' && path === '/') return send(response, 200, page, 'text/html')
  if (!path.startsWith('/api/')) return send(response, 404, { error: 'Not found' })
  if (!hasToken(request)) return send(response, 403, { error: 'Bad token. Open the URL printed by pnpm moderate.' })

  const handle = async () => {
    if (request.method === 'GET' && path === '/api/reports') return send(response, 200, await listReports())
    if (request.method === 'POST' && path === '/api/resolve') {
      const { commentId, action } = (await readJson(request)) as { commentId?: unknown; action?: unknown }
      if (typeof commentId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(commentId)) {
        return send(response, 400, { error: 'Invalid comment ID' })
      }
      if (action !== 'remove' && action !== 'remove-ban' && action !== 'dismiss') {
        return send(response, 400, { error: 'Invalid action' })
      }
      await resolve(commentId, action)
      console.log(`${action}: ${commentId}`)
      return send(response, 200, { ok: true })
    }
    send(response, 404, { error: 'Not found' })
  }
  handle().catch((error: unknown) => {
    console.error(error)
    send(response, 500, { error: error instanceof Error ? error.message : String(error) })
  })
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo
  // The token goes in the hash, so it's never sent to the server in a URL or logged
  const url = `http://127.0.0.1:${port}/#${token}`
  console.log(`Moderation page: ${url}\nPress Ctrl+C to stop.`)
  const opener =
    process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' })
  opener.on('error', () => console.log('Couldn’t open a browser; open the URL above yourself.'))
})
