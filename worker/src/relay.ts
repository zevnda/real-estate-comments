import type { PostLimits, PostRecord } from '../../src/shared/rate-limit.ts'
import type { RelayComment, RelayEdit, RelayVote } from '../../src/shared/relay.ts'
import type { CommitResult, Firestore, FirestoreDocument, Write } from './firestore.ts'

import { buildPropertyKeys } from '../../src/shared/property.ts'
import { DAY, HOUR, rateLimitReason, recentPosts } from '../../src/shared/rate-limit.ts'
import { isReportReason, REPORT_DETAILS_MAX_LENGTH } from '../../src/shared/reports.ts'
import { cleanUsername, EDIT_WINDOW_MS, isPropertyInput, validateCommentText } from '../../src/shared/validation.ts'
import { encodeFields, FirestoreError } from './firestore.ts'
import { hmac } from './ip.ts'

// What the relay does: posting (with a Turnstile token), editing and reporting, each checked against the poster's
// Firebase sign-in and the limits for their network, then written with a service account. Documents have exactly
// the fields the extension used to write itself (see CommentDoc in src/background/comments.ts), so readers and the
// security rules see no difference.

const COMMENTS = 'listingcomments'
const REPORTS = 'reports'
const VOTES = 'votes'
// Who posted each comment, privately, so a moderator can ban the poster's network (see scripts/moderate.ts)
const COMMENT_META = 'commentMeta'
const COMMENT_META_TTL_MS = 90 * 24 * 60 * 60 * 1000
// Bans: `bannedUsers` (the extension's `uid`, and the Auth UIDs in `authUids`; readable by the extension) and
// `networkBans` (by network key, until `expireAt`; private). Both are written only by `pnpm moderate`.
const BANNED_USERS = 'bannedUsers'
const NETWORK_BANS = 'networkBans'
const RATE_LIMITS = 'rateLimits'
const RECENT_TEXTS = 'recentTexts'
// The record of posts from everyone, in rateLimits (network keys are hex, so they can't clash with it)
const EVERYONE = 'everyone'
const SECOND = 1000

// Per network: aimed at flooding, not at rationing normal use. One address can be shared by many people (a household,
// a mobile network's carrier-grade NAT), so keep them generous enough for that.
export const NETWORK_LIMITS: PostLimits = {
  cooldownMs: 60 * SECOND,
  perHour: 5,
  perDay: 15,
  things: 'comments',
  done: 'posted',
  doing: 'posting',
}
// Edits are only possible on your own comments, for 15 minutes, so these only stop a script hammering one
export const EDIT_LIMITS: PostLimits = {
  cooldownMs: 10 * SECOND,
  perHour: 20,
  perDay: 60,
  things: 'edits',
  done: 'made',
  doing: 'editing',
}
// Fresh anonymous accounts are free, so reports are limited by network, and a network can report a comment only once
export const REPORT_LIMITS: PostLimits = {
  cooldownMs: 10 * SECOND,
  perHour: 5,
  perDay: 10,
  things: 'reports',
  done: 'sent',
  doing: 'reporting',
}
// Votes are one per comment per network anyway; this only stops a script running through every comment
export const VOTE_LIMITS: PostLimits = {
  cooldownMs: SECOND,
  perHour: 60,
  perDay: 300,
  things: 'votes',
  done: 'cast',
  doing: 'voting',
}
// Across everyone: stops a botnet (many networks) using up Firestore's free daily quota
export const GLOBAL_PER_HOUR = 50
// The same text can't be posted again (by anyone) for this long
const REPEAT_WINDOW_MS = 7 * DAY
// Short texts ("Same here!") are often written independently, so only longer ones count as repeats
const REPEAT_MIN_LENGTH = 20
// Records are deleted by deleteExpiredRecords once their `expireAt` has passed. (Firestore's TTL policies would do it
// by themselves, but they need billing enabled, and the project is on the free plan.) Each post adds at most three,
// so deleting up to this many per collection after each post keeps up.
const CLEANUP_BATCH = 20
const MAX_BODY = 16 * 1024

export interface RelayDeps {
  firestore: Firestore
  verifyTurnstile(token: string): Promise<boolean>
  // The poster's Firebase Auth UID, or null if the token isn't valid
  verifyIdToken(token: string): Promise<string | null>
  // The poster's network, keyed (see ip.ts), and the secret used to key comment texts for the repeat check
  networkKey: string
  secret: string
  now(): number
  // Runs work after the response has been sent (the Worker's waitUntil)
  afterResponse(task: Promise<unknown>): void
}

// A response the extension shows as-is
export class RelayError extends Error {
  override name = 'RelayError'
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function postComment(request: Request, deps: RelayDeps): Promise<RelayComment> {
  const body = await readJson(request)
  const { property, text, username, userId, replyTo, turnstileToken } = body
  if (!isPropertyInput(property)) throw new RelayError(400, 'Couldn’t read this property’s address.')
  if (typeof text !== 'string' || typeof username !== 'string' || username.length > 200) throw invalid()
  checkText(text)
  if (!isUserId(userId)) throw invalid()
  if (replyTo !== undefined && !isCommentId(replyTo)) throw new RelayError(400, 'Invalid reply.')
  if (typeof turnstileToken !== 'string' || !turnstileToken || turnstileToken.length > 4096) throw invalid()

  // Cheapest checks first: Turnstile tokens are single-use, so a malformed post shouldn't spend one
  if (!(await deps.verifyTurnstile(turnstileToken))) {
    throw new RelayError(403, 'Couldn’t confirm you’re not a bot. Please try posting again.')
  }
  const authUid = await signedIn(request, deps)
  await checkBans(deps, authUid, userId, 'You can’t post comments right now (error 90001).')

  const keys = buildPropertyKeys(property)
  const reply = replyTo ? await replyFields(deps.firestore, replyTo, keys) : null
  const textKey = await repeatKey(text, deps.secret)
  const id = newDocumentId()
  const now = deps.now()
  const comment = {
    // A reply is stored under its parent's address spelling (which may be an older one), so it's found with it
    address: reply?.address ?? keys.address,
    suburb: keys.suburb,
    state: keys.state,
    postcode: keys.postcode,
    url: property.url,
    text: text.trim(),
    timestamp: new Date(now).toISOString(),
    username: cleanUsername(username),
    uid: userId,
    authorAuthUid: authUid,
    ...(reply && { parentId: reply.parentId, replyToId: reply.replyToId }),
  }

  const result = await commitWithRetry(deps, async () => {
    const [network, everyone, repeat] = await Promise.all([
      readNetwork(deps, now),
      deps.firestore.get(`${RATE_LIMITS}/${EVERYONE}`),
      textKey ? deps.firestore.get(`${RECENT_TEXTS}/${textKey}`) : null,
    ])
    limit(network.posts, now, NETWORK_LIMITS)
    const everyonesPosts = toRecords(everyone?.fields.posts).filter(post => now - post.at < HOUR)
    if (everyonesPosts.length >= GLOBAL_PER_HOUR) {
      throw new RelayError(503, 'Lots of comments are being posted right now. Please try again in a few minutes.')
    }
    if (isActive(repeat, now)) {
      throw new RelayError(409, 'This comment has already been posted recently. Please write something new.')
    }
    return [
      networkWrite(deps, network, now, { posts: [...network.posts, { at: now }] }),
      record(deps, `${RATE_LIMITS}/${EVERYONE}`, everyone, {
        posts: [...everyonesPosts, { at: now }],
        expireAt: new Date(now + HOUR),
      }),
      ...(textKey ? [repeatWrite(deps, textKey, repeat, now)] : []),
      record(deps, `${COMMENT_META}/${id}`, null, {
        networkKey: deps.networkKey,
        authUid,
        uid: userId,
        at: new Date(now),
        expireAt: new Date(now + COMMENT_META_TTL_MS),
      }),
      {
        update: { name: deps.firestore.name(`${COMMENTS}/${id}`), fields: encodeFields(comment) },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ]
  })
  return {
    id,
    createdAt: serverTime(result, now),
    ...(reply && { parentId: reply.parentId, replyToId: reply.replyToId }),
  }
}

// The poster changes their own comment's text, within EDIT_WINDOW_MS of posting. The new text gets the same checks
// as a new comment (so a harmless comment can't be edited into spam), but no Turnstile: only its author can edit it.
export async function editComment(request: Request, deps: RelayDeps): Promise<RelayEdit> {
  const { commentId, text, userId } = await readJson(request)
  if (!isCommentId(commentId) || typeof text !== 'string' || !isUserId(userId)) throw invalid()
  checkText(text)
  const authUid = await signedIn(request, deps)
  await checkBans(deps, authUid, userId, 'You can’t edit comments right now (error 90001).')
  const textKey = await repeatKey(text, deps.secret)
  const now = deps.now()

  const result = await commitWithRetry(deps, async () => {
    const [comment, network] = await Promise.all([
      deps.firestore.get(`${COMMENTS}/${commentId}`),
      readNetwork(deps, now),
    ])
    if (!comment) throw new RelayError(404, 'This comment has been deleted.')
    if (comment.fields.authorAuthUid !== authUid) throw new RelayError(403, 'You can only edit your own comments.')
    const { createdAt } = comment.fields
    if (!(createdAt instanceof Date) || now > createdAt.getTime() + EDIT_WINDOW_MS) {
      throw new RelayError(403, 'Comments can only be edited for 15 minutes after posting.')
    }
    limit(network.edits, now, EDIT_LIMITS)
    // Changing a comment's spacing or punctuation leaves the same letters, which isn't a repeat
    const unchanged = textKey === (await repeatKey(String(comment.fields.text), deps.secret))
    const repeat = textKey && !unchanged ? await deps.firestore.get(`${RECENT_TEXTS}/${textKey}`) : null
    if (isActive(repeat, now)) {
      throw new RelayError(409, 'This text has already been posted recently. Please write something new.')
    }
    return [
      networkWrite(deps, network, now, { edits: [...network.edits, { at: now }] }),
      ...(textKey && !unchanged ? [repeatWrite(deps, textKey, repeat, now)] : []),
      {
        update: { name: deps.firestore.name(`${COMMENTS}/${commentId}`), fields: encodeFields({ text: text.trim() }) },
        updateMask: { fieldPaths: ['text'] },
        currentDocument: { updateTime: comment.updateTime },
        updateTransforms: [{ fieldPath: 'editedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ]
  })
  return { text: text.trim(), editedAt: serverTime(result, now) }
}

// Reports go to a collection only the maintainer can read (with `pnpm moderate`), with the ID the security rules
// require (comment ID and the reporter's Auth UID), so each person can report a comment once; and on top of that,
// once per network a day.
export async function reportComment(request: Request, deps: RelayDeps): Promise<null> {
  const { commentId, reason, details, userId } = await readJson(request)
  if (!isCommentId(commentId) || !isUserId(userId)) throw invalid()
  if (!isReportReason(reason)) throw new RelayError(400, 'Choose why you’re reporting this comment.')
  if (typeof details !== 'string' || details.trim().length > REPORT_DETAILS_MAX_LENGTH) {
    throw new RelayError(400, `Details can’t be longer than ${REPORT_DETAILS_MAX_LENGTH} characters.`)
  }
  const authUid = await signedIn(request, deps)
  await checkBans(deps, authUid, userId, 'You can’t report comments right now (error 90001).')
  const reportId = `${commentId}_${authUid}`
  const now = deps.now()

  await commitWithRetry(deps, async () => {
    const [comment, report, network] = await Promise.all([
      deps.firestore.get(`${COMMENTS}/${commentId}`),
      deps.firestore.get(`${REPORTS}/${reportId}`),
      readNetwork(deps, now),
    ])
    if (!comment) throw new RelayError(404, 'This comment has already been removed.')
    if (report || network.reports.some(earlier => earlier.commentId === commentId)) {
      throw new RelayError(409, 'This comment has already been reported. Thanks, we’ll review it.')
    }
    limit(network.reports, now, REPORT_LIMITS)
    return [
      networkWrite(deps, network, now, { reports: [...network.reports, { at: now, commentId }] }),
      {
        update: {
          name: deps.firestore.name(`${REPORTS}/${reportId}`),
          fields: encodeFields({ commentId, reason, details: details.trim(), reporterAuthUid: authUid }),
        },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ]
  })
  return null
}

// Upvotes a comment, or takes the upvote back. One upvote per comment per network: fresh anonymous accounts and
// reinstalls on the same connection can't add more. Each vote is recorded privately in `votes`, keyed by the comment
// and network together (so records for different comments can't be linked to one network), with who cast it, so
// only they can take it back. Votes from before the relay (in `userVotes` only) still count and can be taken back.
export async function toggleVote(request: Request, deps: RelayDeps): Promise<RelayVote> {
  const { commentId, userId } = await readJson(request)
  if (!isCommentId(commentId) || !isUserId(userId)) throw invalid()
  const authUid = await signedIn(request, deps)
  await checkBans(deps, authUid, userId, 'You can’t vote right now (error 90001).')
  const voteKey = await hmac(deps.secret, `vote:${commentId}:${deps.networkKey}`)
  const now = deps.now()

  let outcome: RelayVote = { votes: 0, hasVoted: false }
  await commitWithRetry(deps, async () => {
    const [comment, vote, network] = await Promise.all([
      deps.firestore.get(`${COMMENTS}/${commentId}`),
      deps.firestore.get(`${VOTES}/${voteKey}`),
      readNetwork(deps, now),
    ])
    if (!comment) throw new RelayError(404, 'This comment has been deleted.')
    if (comment.fields.uid === userId || comment.fields.authorAuthUid === authUid) {
      throw new RelayError(403, 'You can’t vote on your own comment.')
    }
    const userVotes = comment.fields.userVotes as Record<string, unknown> | undefined
    const ownVote = vote && (vote.fields.authUid === authUid || vote.fields.uid === userId)
    // A vote from before the relay can always be taken back, whoever else on the network has voted since
    const legacyVote = !ownVote && userVotes?.[userId] === 'up'
    if (vote && !ownVote && !legacyVote) {
      throw new RelayError(409, 'Someone on your internet connection has already upvoted this comment.')
    }
    limit(network.votes, now, VOTE_LIMITS)

    const hasVoted = !ownVote && !legacyVote
    const current = typeof comment.fields.votes === 'number' ? comment.fields.votes : 0
    const votes = Math.max(0, current + (hasVoted ? 1 : -1))
    // The voter's entry in userVotes, which is how the extension shows "you upvoted this"
    const voter = hasVoted ? userId : ownVote && typeof vote.fields.uid === 'string' ? vote.fields.uid : userId
    outcome = { votes, hasVoted }
    return [
      networkWrite(deps, network, now, { votes: [...network.votes, { at: now }] }),
      {
        update: {
          name: deps.firestore.name(`${COMMENTS}/${commentId}`),
          fields: encodeFields({ votes, ...(hasVoted && { userVotes: { [voter]: 'up' } }) }),
        },
        // A masked field that isn't in `fields` is removed: that's how a vote is taken back
        updateMask: { fieldPaths: ['votes', fieldPath('userVotes', voter)] },
        currentDocument: { updateTime: comment.updateTime },
      },
      hasVoted
        ? record(deps, `${VOTES}/${voteKey}`, null, { commentId, authUid, uid: userId, at: new Date(now) })
        : ownVote
          ? { delete: deps.firestore.name(`${VOTES}/${voteKey}`), currentDocument: { updateTime: vote.updateTime } }
          : null,
    ].filter(write => write !== null)
  })
  return outcome
}

// A Firestore field path. Segments that aren't plain identifiers (user IDs have dashes) are quoted with backticks.
export function fieldPath(...segments: string[]): string {
  return segments
    .map(segment =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment) ? segment : `\`${segment.replace(/[\\`]/g, char => `\\${char}`)}\``,
    )
    .join('.')
}

// The repeat check's key for a comment: its letters and digits, lowercased, keyed with the relay's secret, so the
// stored key doesn't reveal the text. Null for short texts, which aren't checked.
export async function repeatKey(text: string, secret: string): Promise<string | null> {
  const letters = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
  return letters.length < REPEAT_MIN_LENGTH ? null : hmac(secret, `text:${letters}`)
}

// Deletes limit, repeat, poster and network ban records whose `expireAt` has passed, so nothing derived from an IP
// address is kept longer than it's needed (until the next post after that). Each is deleted only if it hasn't changed since it was found.
export async function deleteExpiredRecords(firestore: Firestore, now: number): Promise<number> {
  const expired = (
    await Promise.all(
      [RATE_LIMITS, RECENT_TEXTS, COMMENT_META, NETWORK_BANS].map(collection =>
        firestore.listBefore(collection, 'expireAt', new Date(now), CLEANUP_BATCH),
      ),
    )
  ).flat()
  if (!expired.length) return 0
  await firestore.commit(expired.map(({ name, updateTime }) => ({ delete: name, currentDocument: { updateTime } })))
  return expired.length
}

// Reads what the writes depend on and returns them; they're then committed with each record's last update time as a
// precondition, so two requests at the same moment can't both slip under a limit. Retried if that happens (the
// record for everyone changes with every post). Expired records are cleaned up after a successful commit.
async function commitWithRetry(deps: RelayDeps, prepare: () => Promise<Write[]>): Promise<CommitResult> {
  for (let attempt = 0; ; attempt++) {
    const writes = await prepare()
    try {
      const result = await deps.firestore.commit(writes)
      deps.afterResponse(deleteExpiredRecords(deps.firestore, deps.now()))
      return result
    } catch (error) {
      const conflict =
        error instanceof FirestoreError && ['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED'].includes(error.status)
      if (!conflict || attempt >= 2) throw error
    }
  }
}

// Refuses banned posters: by network (until the ban expires), Auth UID or the extension's user ID. A reinstall
// changes both IDs, but not the network.
async function checkBans(deps: RelayDeps, authUid: string, userId: string, message: string) {
  const [network, byUid, byAuthUid] = await Promise.all([
    deps.firestore.get(`${NETWORK_BANS}/${deps.networkKey}`),
    deps.firestore.exists(BANNED_USERS, 'uid', 'EQUAL', userId),
    deps.firestore.exists(BANNED_USERS, 'authUids', 'ARRAY_CONTAINS', authUid),
  ])
  if (isActive(network, deps.now()) || byUid || byAuthUid) throw new RelayError(403, message)
}

// The poster's Firebase Auth UID, from the ID token in the Authorization header
async function signedIn(request: Request, deps: RelayDeps): Promise<string> {
  const idToken = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
  const authUid = idToken ? await deps.verifyIdToken(idToken) : null
  if (!authUid) throw new RelayError(401, 'Couldn’t confirm who you are. Refresh the page and try again.')
  return authUid
}

// A network's record (rateLimits/<network key>): what it has done in the last day
interface NetworkRecord {
  document: FirestoreDocument | null
  posts: PostRecord[]
  edits: PostRecord[]
  votes: PostRecord[]
  reports: (PostRecord & { commentId: string })[]
}

async function readNetwork(deps: RelayDeps, now: number): Promise<NetworkRecord> {
  const document = await deps.firestore.get(`${RATE_LIMITS}/${deps.networkKey}`)
  const reports = Array.isArray(document?.fields.reports) ? (document.fields.reports as unknown[]) : []
  return {
    document,
    posts: recentPosts(toRecords(document?.fields.posts), now),
    edits: recentPosts(toRecords(document?.fields.edits), now),
    votes: recentPosts(toRecords(document?.fields.votes), now),
    reports: recentPosts(
      reports.flatMap(item => {
        const { at, commentId } = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
        return typeof at === 'number' && typeof commentId === 'string' ? [{ at, commentId }] : []
      }),
      now,
    ),
  }
}

function networkWrite(
  deps: RelayDeps,
  network: NetworkRecord,
  now: number,
  change: Partial<Omit<NetworkRecord, 'document'>>,
): Write {
  const { posts, edits, votes, reports } = { ...network, ...change }
  return record(deps, `${RATE_LIMITS}/${deps.networkKey}`, network.document, {
    posts,
    edits,
    votes,
    reports,
    expireAt: new Date(now + DAY),
  })
}

function repeatWrite(deps: RelayDeps, textKey: string, existing: FirestoreDocument | null, now: number): Write {
  return record(deps, `${RECENT_TEXTS}/${textKey}`, existing, { expireAt: new Date(now + REPEAT_WINDOW_MS) })
}

// Replaces a record, provided it hasn't changed since it was read (or still doesn't exist)
function record(
  deps: RelayDeps,
  path: string,
  existing: FirestoreDocument | null,
  data: Record<string, unknown>,
): Write {
  return {
    update: { name: deps.firestore.name(path), fields: encodeFields(data) },
    currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false },
  }
}

function isActive(record: FirestoreDocument | null, now: number): boolean {
  const until = record?.fields.expireAt
  return until instanceof Date && until.getTime() > now
}

function limit(history: PostRecord[], now: number, limits: PostLimits) {
  const reason = rateLimitReason(history, now, limits)
  if (reason) throw new RelayError(429, reason)
}

// The server time set by the last write's transform
function serverTime(result: CommitResult, fallback: number): number {
  const value = result.writeResults.at(-1)?.transformResults?.[0]
  return value && 'timestampValue' in value ? Date.parse(value.timestampValue) : fallback
}

function checkText(text: string) {
  const problem = validateCommentText(text)
  if (problem) throw new RelayError(400, problem)
}

const invalid = () => new RelayError(400, 'Invalid request.')

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > MAX_BODY) throw invalid()
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // Falls through
  }
  throw invalid()
}

// Replies are one level deep, like Discord: replying to a reply puts the new reply under the same top-level comment,
// pointing at the reply it answers. Same checks as the security rules make on replies.
async function replyFields(
  firestore: Firestore,
  replyToId: string,
  keys: ReturnType<typeof buildPropertyKeys>,
): Promise<{ parentId: string; replyToId: string; address: string }> {
  const target = await firestore.get(`${COMMENTS}/${replyToId}`)
  if (!target) throw new RelayError(404, 'The comment you’re replying to has been deleted.')
  const { address, suburb, parentId } = target.fields
  if (typeof address !== 'string' || suburb !== keys.suburb || !keys.addressVariants.includes(address)) {
    throw new RelayError(400, 'You can only reply to comments on this property.')
  }
  if (typeof parentId !== 'string') return { parentId: replyToId, replyToId, address }
  const parent = await firestore.get(`${COMMENTS}/${parentId}`)
  if (!parent || typeof parent.fields.address !== 'string' || typeof parent.fields.parentId === 'string') {
    throw new RelayError(404, 'This conversation’s first comment has been deleted, so it can’t be replied to.')
  }
  return { parentId, replyToId, address: parent.fields.address }
}

// Records from the first relay version also have `property` and `reply`, which no longer matter
function toRecords(value: unknown): PostRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const at = item && typeof item === 'object' ? (item as Record<string, unknown>).at : undefined
    return typeof at === 'number' ? [{ at }] : []
  })
}

// The extension's anonymous user ID (a UUID)
function isUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value)
}

function isCommentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value)
}

// Like Firestore's own automatic IDs: 20 random letters and digits
function newDocumentId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  while (id.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(40))) {
      // 248 = 62 × 4: anything above would favour the first few characters
      if (byte < 248 && id.length < 20) id += chars[byte % 62]
    }
  }
  return id
}
