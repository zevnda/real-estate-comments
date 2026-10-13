// Moderates comments. Starts a small server on your machine and opens a page where you can review reported comments
// (remove, ban the poster, or dismiss the reports), browse every comment (edit, delete, look at a poster's or a
// property's comments) and manage bans. Uses the Firebase Admin SDK, which bypasses the security rules, with a
// service account key that never leaves your machine.
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
import type { DocumentSnapshot, Query } from 'firebase-admin/firestore'
import type { PropertyLinks } from '../src/shared/property.ts'

import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

import { canonicalAddress, propertyLinks, titleCase } from '../src/shared/property.ts'
import { reportReasonLabel } from '../src/shared/reports.ts'
import { cleanUsername, USERNAME_MAX_LENGTH, validateCommentText } from '../src/shared/validation.ts'

const COMMENTS = 'listingcomments'
const REPORTS = 'reports'
const BANNED_USERS = 'bannedUsers'
// Written by the comment relay: who posted each comment (network key, Auth UID, `uid`), kept 90 days
const COMMENT_META = 'commentMeta'
// Read by the comment relay: bans by network, until `expireAt`
const NETWORK_BANS = 'networkBans'
// How long a network stays banned. Home addresses change hands and mobile ones are shared, so not for ever.
const NETWORK_BAN_DAYS = 60
// The poster's recent comments looked at for their networks when banning
const MAX_META = 50
const MAX_REPORTS = 500
const MAX_BANS = 1000
// Comments per page in the Comments view, and the most shown for one poster, property or thread
const PAGE_SIZE = 50
const MAX_SCOPED = 200
// Firestore's limit for `in` queries
const IN_LIMIT = 30

type ReportStatus = 'open' | 'removed' | 'dismissed'

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
  editedAt?: Timestamp
  votes?: number
  parentId?: string
  replyToId?: string
}

interface BanDoc {
  uid: string
  // Their Firebase Auth UIDs, which the comment relay also checks (missing on bans from before it)
  authUids?: string[]
  bannedAt?: Timestamp
  commentId?: string
}

interface CommentMetaDoc {
  networkKey: string
  authUid: string
  uid: string
}

interface NetworkBanDoc {
  uid: string
  expireAt: Timestamp
}

// A comment as the page shows it
interface CommentView {
  id: string
  text: string
  username: string
  uid: string | null
  address: string
  locality: string
  // The stored keys, for looking up the property's other comments
  key: { address: string; suburb: string }
  links: PropertyLinks | null
  createdAt: number
  editedAt: number | null
  votes: number
  parentId: string | null
}

// One entry per reported comment, with all its reports
interface ReportedComment {
  commentId: string
  open: boolean
  comment: CommentView | null
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

// Errors whose message is shown on the page as is
class BadRequest extends Error {}

function commentView(snap: DocumentSnapshot): CommentView | null {
  if (!snap.exists) return null
  const data = snap.data() as CommentDoc
  return {
    id: snap.id,
    text: data.text,
    username: data.username ?? 'Anonymous',
    uid: data.uid ?? null,
    address: titleCase(canonicalAddress(data.address)),
    locality: [titleCase(data.suburb), data.state?.toUpperCase(), data.postcode].filter(Boolean).join(' '),
    key: { address: data.address, suburb: data.suburb },
    links:
      data.state && data.postcode
        ? propertyLinks({ address: data.address, suburb: data.suburb, state: data.state, postcode: data.postcode })
        : null,
    createdAt: data.createdAt?.toMillis() ?? (data.timestamp ? Date.parse(data.timestamp) : 0),
    editedAt: data.editedAt?.toMillis() ?? null,
    votes: data.votes ?? 0,
    parentId: data.parentId ?? null,
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

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
    return {
      commentId: snap.id,
      open: reports.some(report => report.status === 'open'),
      comment: commentView(snap),
      reports,
    }
  })
}

// Comments for the Comments view: every comment newest first, a page at a time (`after` is the last comment shown),
// or all of one poster's, one property's or one thread's. Each query is served by an existing index: the automatic
// single-field ones on `createdAt`, `uid` and `parentId`, and 1.x's composite (address, suburb, createdAt).
async function listComments(params: URLSearchParams): Promise<{ comments: CommentView[]; next: string | null }> {
  const comments = db.collection(COMMENTS)
  const poster = params.get('poster')
  const address = params.get('address')
  const suburb = params.get('suburb')
  const thread = params.get('thread')
  const newestFirst = (a: CommentView, b: CommentView) => b.createdAt - a.createdAt

  if (poster) {
    // No orderBy: that would need a composite index (uid, createdAt)
    const snapshot = await comments.where('uid', '==', poster).limit(MAX_SCOPED).get()
    return { comments: snapshot.docs.map(doc => commentView(doc)!).sort(newestFirst), next: null }
  }
  if (address !== null && suburb !== null) {
    const snapshot = await comments
      .where('address', '==', address)
      .where('suburb', '==', suburb)
      .orderBy('createdAt', 'desc')
      .limit(MAX_SCOPED)
      .get()
    return { comments: snapshot.docs.map(doc => commentView(doc)!), next: null }
  }
  if (thread) {
    const [root, replies] = await Promise.all([
      comments.doc(thread).get(),
      comments.where('parentId', '==', thread).limit(MAX_SCOPED).get(),
    ])
    const views = [commentView(root), ...replies.docs.map(doc => commentView(doc))].filter(view => view !== null)
    return { comments: views.sort((a, b) => a.createdAt - b.createdAt), next: null }
  }

  let query: Query = comments.orderBy('createdAt', 'desc')
  const after = params.get('after')
  if (after) {
    const cursor = await comments.doc(after).get()
    if (!cursor.exists) throw new BadRequest('The last comment shown has been deleted. Refresh to start again.')
    query = query.startAfter(cursor)
  }
  const snapshot = await query.limit(PAGE_SIZE).get()
  return {
    comments: snapshot.docs.map(doc => commentView(doc)!),
    next: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.size - 1]!.id : null,
  }
}

async function listBans() {
  const [bans, networkBans] = await Promise.all([
    db.collection(BANNED_USERS).limit(MAX_BANS).get(),
    db.collection(NETWORK_BANS).limit(MAX_BANS).get(),
  ])
  // Each poster's network bans: how many, and when the last one ends
  const networks = new Map<string, { count: number; until: number }>()
  for (const doc of networkBans.docs) {
    const { uid, expireAt } = doc.data() as NetworkBanDoc
    if (expireAt.toMillis() < Date.now()) continue
    const entry = networks.get(uid) ?? { count: 0, until: 0 }
    networks.set(uid, { count: entry.count + 1, until: Math.max(entry.until, expireAt.toMillis()) })
  }
  return bans.docs
    .map(doc => {
      const ban = doc.data() as BanDoc
      return {
        uid: ban.uid,
        bannedAt: ban.bannedAt?.toMillis() ?? null,
        commentId: ban.commentId ?? null,
        networks: networks.get(ban.uid) ?? null,
      }
    })
    .sort((a, b) => (b.bannedAt ?? 0) - (a.bannedAt ?? 0))
}

// Closes the open reports on these comments. Reports are kept, marked with the outcome, as a record of how
// complaints were handled.
async function closeReports(commentIds: string[], status: Exclude<ReportStatus, 'open'>) {
  const batch = db.batch()
  for (const ids of chunks(commentIds, IN_LIMIT)) {
    const reports = await db.collection(REPORTS).where('commentId', 'in', ids).get()
    for (const report of reports.docs) {
      if ((report.data() as ReportDoc).status) continue
      batch.update(report.ref, { status, resolvedAt: FieldValue.serverTimestamp() })
    }
  }
  await batch.commit()
}

// Bans a poster by their `uid` (what the extension checks), and, for the comment relay, by their Firebase Auth UIDs
// and the networks they've posted from: everything recorded in `commentMeta` for this comment and their other
// comments from the last 90 days. A reinstall changes both IDs but not the network, so the network ban is what keeps
// them out; it lasts NETWORK_BAN_DAYS. Banning again adds anything new and restarts the network bans. Returns how many
// networks were banned (0 for posters with no comments through the relay in the last 90 days).
async function ban(uid: string, commentId: string | null): Promise<number> {
  const [existing, metaForUid, metaForComment] = await Promise.all([
    db.collection(BANNED_USERS).where('uid', '==', uid).limit(1).get(),
    db.collection(COMMENT_META).where('uid', '==', uid).limit(MAX_META).get(),
    commentId ? db.collection(COMMENT_META).doc(commentId).get() : null,
  ])
  const meta = [...metaForUid.docs, ...(metaForComment?.exists ? [metaForComment] : [])].map(
    doc => doc.data() as CommentMetaDoc,
  )
  const authUids = [...new Set(meta.map(entry => entry.authUid))]
  const networkKeys = [...new Set(meta.map(entry => entry.networkKey))]

  const batch = db.batch()
  // The extension looks bans up by `uid`, the relay by `uid` and `authUids`; the other fields are for your reference
  if (existing.empty) {
    batch.create(db.collection(BANNED_USERS).doc(), {
      uid,
      authUids,
      bannedAt: FieldValue.serverTimestamp(),
      ...(commentId ? { commentId } : {}),
    })
  } else if (authUids.length) {
    batch.update(existing.docs[0]!.ref, { authUids: FieldValue.arrayUnion(...authUids) })
  }
  const expireAt = Timestamp.fromMillis(Date.now() + NETWORK_BAN_DAYS * 24 * 60 * 60 * 1000)
  for (const networkKey of networkKeys) {
    batch.set(db.collection(NETWORK_BANS).doc(networkKey), {
      uid,
      bannedAt: FieldValue.serverTimestamp(),
      expireAt,
      ...(commentId ? { commentId } : {}),
    })
  }
  await batch.commit()
  return networkKeys.length
}

async function unban(uid: string) {
  const [bans, networkBans] = await Promise.all([
    db.collection(BANNED_USERS).where('uid', '==', uid).get(),
    db.collection(NETWORK_BANS).where('uid', '==', uid).get(),
  ])
  const batch = db.batch()
  for (const doc of [...bans.docs, ...networkBans.docs]) batch.delete(doc.ref)
  await batch.commit()
}

// Bans a poster and deletes every comment they've posted (by `uid`), closing the open reports on them. Other
// people's replies under their comments stay, shown as replying to a deleted comment. Votes they cast stay too:
// removing them would mean rewriting every comment they voted on.
async function purge(uid: string, commentId: string | null): Promise<number> {
  await ban(uid, commentId)
  const deleted: string[] = []
  for (;;) {
    // Firestore allows 500 writes per batch
    const snapshot = await db.collection(COMMENTS).where('uid', '==', uid).limit(400).get()
    if (snapshot.empty) break
    const batch = db.batch()
    for (const doc of snapshot.docs) batch.delete(doc.ref)
    await batch.commit()
    deleted.push(...snapshot.docs.map(doc => doc.id))
  }
  await closeReports(deleted, 'removed')
  return deleted.length
}

// Deletes a comment (with `withReplies`, the replies under it too), optionally bans its poster, and closes the open
// reports on everything deleted. A comment that's already gone just has its reports closed.
async function deleteComment(id: string, options: { withReplies: boolean; banPoster: boolean }) {
  const ref = db.collection(COMMENTS).doc(id)
  const snap = await ref.get()
  const ids = [id]
  if (snap.exists) {
    const data = snap.data() as CommentDoc
    if (options.banPoster) {
      if (!data.uid) throw new BadRequest('This comment has no user ID, so its poster can’t be banned.')
      await ban(data.uid, id)
    }
    const batch = db.batch()
    batch.delete(ref)
    if (options.withReplies && !data.parentId) {
      const replies = await db.collection(COMMENTS).where('parentId', '==', id).get()
      for (const reply of replies.docs) {
        batch.delete(reply.ref)
        ids.push(reply.id)
      }
    }
    await batch.commit()
  }
  await closeReports(ids, 'removed')
  return ids.length
}

// A moderator's edit. `markEdited` sets `editedAt`, so the extension shows "(edited)", as it does for posters' edits.
async function editComment(id: string, text: string, username: string, markEdited: boolean) {
  const problem = validateCommentText(text)
  if (problem) throw new BadRequest(problem)
  const ref = db.collection(COMMENTS).doc(id)
  if (!(await ref.get()).exists) throw new BadRequest('This comment has been deleted.')
  await ref.update({
    text: text.trim(),
    username: cleanUsername(username),
    ...(markEdited ? { editedAt: FieldValue.serverTimestamp() } : {}),
  })
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

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 20_000) throw new BadRequest('Request too large')
  }
  const parsed = JSON.parse(body) as unknown
  if (!parsed || typeof parsed !== 'object') throw new BadRequest('Invalid request')
  return parsed as Record<string, unknown>
}

function commentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(value)) throw new BadRequest('Invalid comment ID')
  return value
}

function userId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new BadRequest('Invalid user ID')
  return value
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new BadRequest('Invalid text')
  return value
}

type Handler = (body: Record<string, unknown>) => Promise<unknown>

const actions: Record<string, Handler> = {
  async delete(body) {
    const id = commentId(body.id)
    const deleted = await deleteComment(id, { withReplies: body.withReplies === true, banPoster: body.ban === true })
    console.log(`delete${body.ban === true ? ' and ban' : ''}: ${id} (${deleted} comment${deleted === 1 ? '' : 's'})`)
    return { deleted }
  },
  async dismiss(body) {
    const id = commentId(body.id)
    await closeReports([id], 'dismissed')
    console.log(`dismiss reports: ${id}`)
  },
  async edit(body) {
    const id = commentId(body.id)
    await editComment(
      id,
      text(body.text, 10_000),
      text(body.username ?? '', USERNAME_MAX_LENGTH * 2),
      body.markEdited === true,
    )
    console.log(`edit: ${id}`)
  },
  async ban(body) {
    const uid = userId(body.uid)
    const networks = await ban(uid, body.commentId ? commentId(body.commentId) : null)
    console.log(`ban: ${uid} (${networks} network${networks === 1 ? '' : 's'})`)
    return { networks }
  },
  async purge(body) {
    const uid = userId(body.uid)
    const deleted = await purge(uid, body.commentId ? commentId(body.commentId) : null)
    console.log(`ban and purge: ${uid} (${deleted} comment${deleted === 1 ? '' : 's'})`)
    return { deleted }
  },
  async unban(body) {
    const uid = userId(body.uid)
    await unban(uid)
    console.log(`unban: ${uid}`)
  },
}

const server = createServer((request, response) => {
  const { port } = server.address() as AddressInfo
  // Refuse anything not addressed to this server by IP (DNS rebinding)
  if (request.headers.host !== `127.0.0.1:${port}`) return send(response, 403, { error: 'Forbidden' })
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname

  if (request.method === 'GET' && path === '/') return send(response, 200, page, 'text/html')
  if (!path.startsWith('/api/')) return send(response, 404, { error: 'Not found' })
  if (!hasToken(request)) return send(response, 403, { error: 'Bad token. Open the URL printed by pnpm moderate.' })

  const handle = async () => {
    if (request.method === 'GET') {
      if (path === '/api/reports') return send(response, 200, await listReports())
      if (path === '/api/comments') return send(response, 200, await listComments(url.searchParams))
      if (path === '/api/bans') return send(response, 200, await listBans())
    }
    const name = path.slice('/api/'.length)
    if (request.method === 'POST' && Object.hasOwn(actions, name)) {
      return send(response, 200, (await actions[name]!(await readJson(request))) ?? { ok: true })
    }
    send(response, 404, { error: 'Not found' })
  }
  handle().catch((error: unknown) => {
    if (error instanceof BadRequest || error instanceof SyntaxError) {
      return send(response, 400, { error: error.message })
    }
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
