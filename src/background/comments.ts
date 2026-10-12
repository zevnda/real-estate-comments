import type { DocumentSnapshot } from 'firebase/firestore/lite'
import type { AreaStats, CommentView, RecentCommentView, ReplyNotice, SearchResult } from '../shared/messages'
import type { Area, PropertyInput } from '../shared/property'
import type { ReportReason } from '../shared/reports'
import type { SearchLookup, SearchQuery } from '../shared/search'

import { FirebaseError } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore/lite'

import { RECENT_PAGE } from '../shared/messages'
import { buildPropertyKeys, canonicalAddress, propertyLinks, titleCase } from '../shared/property'
import { MIN_SCORE, parseSearchQuery, scoreMatch, searchLookups } from '../shared/search'
import { cleanUsername, EDIT_WINDOW_MS } from '../shared/validation'
import { cached, invalidate } from './cache'
import { db, ensureSignedIn } from './firebase'

// A document in the `listingcomments` collection. The field set is fixed by the deployed security rules and by
// comments saved by 1.x versions, so don't rename or add fields without updating the rules first (see CLAUDE.md).
interface CommentDoc {
  address: string
  suburb: string
  state?: string
  postcode?: string
  url?: string
  text: string
  // ISO string, set by the client. Kept for compatibility; `createdAt` is the one to sort by.
  timestamp?: string
  username?: string
  // The poster's anonymous extension user ID (not the Firebase Auth UID)
  uid?: string
  // The poster's Firebase Auth UID. The security rules only allow deleting a comment whose authorAuthUid is the
  // caller's, since `uid` is visible to everyone and can't be verified. Missing on comments from older versions.
  authorAuthUid?: string
  createdAt?: Timestamp
  // Set when the poster edits it (within EDIT_WINDOW_MS)
  editedAt?: Timestamp
  // Replies only: the top-level comment it's under, and the comment it answers. A reply copies its parent's
  // address and suburb, so the property's comment query finds it (and old versions show it as a normal comment).
  parentId?: string
  replyToId?: string
  votes?: number
  // Voter user ID → 'up'
  userVotes?: Record<string, 'up'>
}

// A comment as it's cached: plain data (Firestore's Timestamp objects can't be stored), independent of who's viewing
interface CommentRecord {
  id: string
  address: string
  suburb: string
  state?: string
  postcode?: string
  text: string
  username?: string
  uid?: string
  authorAuthUid?: string
  // Milliseconds since the epoch, or 0 if unknown
  createdAt: number
  editedAt?: number
  parentId?: string
  replyToId?: string
  votes: number
  userVotes?: Record<string, 'up'>
}

const COMMENTS = 'listingcomments'
const BANNED_USERS = 'bannedUsers'
const REPORTS = 'reports'
const MAX_COMMENTS_PER_PROPERTY = 100
const SEARCH_SCAN_LIMIT = 300
// Upper bound for prefix range queries: `>= prefix` and `< prefix + PREFIX_END` matches everything starting with prefix
const PREFIX_END = String.fromCharCode(0xf8ff)
// Comments scanned when a search has no street number, postcode or suburb to look up by
const SEARCH_RECENT_SCAN = 500
const SEARCH_RESULTS = 20
// Notifications: the user's comments looked at for replies, and replies read per lookup
const MAX_OWN_COMMENTS = 200
const MAX_REPLIES = 100
// Firestore's limit on `in` values
const IN_LIMIT = 30

// How long reads are cached. New comments are rare, so other people's comments may take up to these to appear; the
// user's own posts, votes and deletes clear the cache straight away, and the panel's refresh button skips it.
const MINUTE = 60 * 1000
const TTL = {
  property: 5 * MINUTE,
  recent: 5 * MINUTE,
  search: 5 * MINUTE,
  searchScan: 10 * MINUTE,
  area: 10 * MINUTE,
  ban: 60 * MINUTE,
  // Opening the panel is answered from the cache, so opening and closing it repeatedly doesn't query again; its timed
  // checks while open skip the cache (down to MIN_REFRESH_INTERVAL)
  notices: 5 * MINUTE,
}
// Cache key prefixes, so a write can clear everything that shows comments
const COMMENT_CACHES = ['property:', 'recent', 'search:', 'area:']

// An error whose message is safe and useful to show the user as-is.
export class UserError extends Error {
  override name = 'UserError'
}

export async function listComments(property: PropertyInput, userId: string, fresh = false): Promise<CommentView[]> {
  const authUid = await ensureSignedIn()
  const keys = buildPropertyKeys(property)
  const records = await cached(
    `property:${JSON.stringify([keys.addressVariants, keys.suburb])}`,
    TTL.property,
    async () => {
      await ensureSignedIn()
      // `in` matches any of the address spellings. This is served by the same composite index as the 1.x query
      // (address, suburb, createdAt desc), so it needs no index changes.
      const snapshot = await getDocs(
        query(
          collection(db, COMMENTS),
          where('address', 'in', keys.addressVariants),
          where('suburb', '==', keys.suburb),
          orderBy('createdAt', 'desc'),
          limit(MAX_COMMENTS_PER_PROPERTY),
        ),
      )
      return snapshot.docs.map(toRecord)
    },
    fresh,
  )
  return (
    records
      // The query can't include the postcode (no index for it), so drop same-named streets in same-named suburbs
      // elsewhere, e.g. Richmond VIC and Richmond NSW
      .filter(record => !record.postcode || record.postcode === keys.postcode)
      .map(record => toView(record, userId, authUid))
  )
}

// The newest comments across every property, a page at a time: `before` (ms) is the createdAt of the last comment
// already shown, so a comment posted while the user scrolls can't shift the pages and repeat or skip one. Served by
// the automatic single-field index on createdAt. Each page is cached; the user's writes clear them all ('recent').
export async function recentComments(userId: string, fresh = false, before?: number): Promise<RecentCommentView[]> {
  const authUid = await ensureSignedIn()
  const records = await cached(
    before === undefined ? 'recent' : `recent:${before}`,
    TTL.recent,
    async () => {
      await ensureSignedIn()
      const snapshot = await getDocs(
        query(
          collection(db, COMMENTS),
          orderBy('createdAt', 'desc'),
          ...(before === undefined ? [] : [startAfter(Timestamp.fromMillis(before))]),
          limit(RECENT_PAGE),
        ),
      )
      return snapshot.docs.map(toRecord)
    },
    fresh,
  )
  return records.map(record => {
    const { address, suburb, state, postcode } = record
    return {
      ...toView(record, userId, authUid),
      ...displayFields(record),
      links: state && postcode ? propertyLinks({ address, suburb, state, postcode }) : null,
    }
  })
}

// Replies to the user's comments: anything under their top-level comments, and replies answering their replies in
// other people's threads. Each lookup is served by an automatic single-field index (`uid`, `parentId`, `replyToId`),
// and cached for TTL.notices; the user's own replies are left out.
export async function replyNotices(userId: string, fresh = false): Promise<ReplyNotice[]> {
  const authUid = await ensureSignedIn()
  const own = await cached(
    `notices:own:${userId}`,
    TTL.notices,
    async () => {
      const snapshot = await getDocs(
        query(collection(db, COMMENTS), where('uid', '==', userId), limit(MAX_OWN_COMMENTS)),
      )
      return snapshot.docs.map(toRecord)
    },
    fresh,
  )
  const ownIds = new Set(own.map(record => record.id))
  const lookups = [
    ...chunk(own.filter(record => !record.parentId).map(record => record.id)).map(ids => ({ field: 'parentId', ids })),
    ...chunk(own.filter(record => record.parentId).map(record => record.id)).map(ids => ({ field: 'replyToId', ids })),
  ]
  const batches = await Promise.all(
    lookups.map(({ field, ids }) =>
      cached(
        `notices:${field}:${ids.join(',')}`,
        TTL.notices,
        async () => {
          const snapshot = await getDocs(query(collection(db, COMMENTS), where(field, 'in', ids), limit(MAX_REPLIES)))
          return snapshot.docs.map(toRecord)
        },
        fresh,
      ),
    ),
  )
  const replies = new Map<string, CommentRecord>()
  for (const record of batches.flat()) if (record.uid !== userId) replies.set(record.id, record)
  return [...replies.values()].map(record => {
    const { address, suburb, state, postcode } = record
    return {
      comment: toView(record, userId, authUid),
      direct: !!record.replyToId && ownIds.has(record.replyToId),
      property:
        state && postcode
          ? { address: canonicalAddress(address), suburb, state, postcode, ...displayFields(record) }
          : null,
    }
  })
}

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += IN_LIMIT) chunks.push(items.slice(i, i + IN_LIMIT))
  return chunks
}

function displayFields(record: CommentRecord): { displayAddress: string; displayLocality: string } {
  const { address, suburb, state, postcode } = record
  return {
    displayAddress: titleCase(canonicalAddress(address)),
    displayLocality: [titleCase(suburb), state?.toUpperCase(), postcode].filter(Boolean).join(' '),
  }
}

// Finds properties that have comments by address (see shared/search.ts for how). Results are grouped by property,
// best match first.
export async function searchComments(text: string, userId: string): Promise<SearchResult[]> {
  const search = parseSearchQuery(text)
  if (!search) return []

  const viewer = { userId, authUid: await ensureSignedIn() }
  let records = await runLookups(searchLookups(search))
  let results = rankSearchResults(search, records, viewer)
  // Nothing specific matched (a street on its own, a misspelt suburb): fuzzy-match recent comments instead
  if (!results.length) {
    records = await runLookups([{ kind: 'recent' }])
    results = rankSearchResults(search, records, viewer)
  }
  return results
}

// Runs the lookups in parallel and merges the results. Each is cached, which matters most here: users type one
// character at a time, and successive queries mostly share their lookups.
async function runLookups(lookups: SearchLookup[]): Promise<CommentRecord[]> {
  const batches = await Promise.all(lookups.map(fetchLookup))
  const byId = new Map<string, CommentRecord>()
  for (const record of batches.flat()) byId.set(record.id, record)
  return [...byId.values()]
}

function fetchLookup(lookup: SearchLookup): Promise<CommentRecord[]> {
  const ttl = lookup.kind === 'recent' ? TTL.searchScan : TTL.search
  return cached(`search:${JSON.stringify(lookup)}`, ttl, async () => {
    await ensureSignedIn()
    // Each of these is served by an automatic single-field index; none needs a composite index
    const constraints =
      lookup.kind === 'number'
        ? [
            where('address', '>=', lookup.prefix),
            where('address', '<', `${lookup.prefix}${PREFIX_END}`),
            orderBy('address'),
          ]
        : lookup.kind === 'suburb'
          ? [
              where('suburb', '>=', lookup.prefix),
              where('suburb', '<', `${lookup.prefix}${PREFIX_END}`),
              orderBy('suburb'),
            ]
          : lookup.kind === 'postcode'
            ? [where('postcode', '==', lookup.postcode)]
            : [orderBy('createdAt', 'desc')]
    const limitCount = lookup.kind === 'recent' ? SEARCH_RECENT_SCAN : SEARCH_SCAN_LIMIT
    const snapshot = await getDocs(query(collection(db, COMMENTS), ...constraints, limit(limitCount)))
    return snapshot.docs.map(toRecord)
  })
}

// Groups comments by property, scores each property against the query, and returns the best matches
function rankSearchResults(
  search: SearchQuery,
  records: CommentRecord[],
  viewer: { userId: string; authUid: string },
): SearchResult[] {
  // Old spellings of the same address ("97  yates ave") join their property's group
  const groups = new Map<string, CommentRecord[]>()
  for (const record of records) {
    const key = [canonicalAddress(record.address), record.suburb, record.postcode].join('|')
    groups.set(key, [...(groups.get(key) ?? []), record])
  }

  return [...groups.entries()]
    .map(([id, group]) => ({ id, group, score: scoreMatch(search, group[0]!) }))
    .filter(({ score }) => score >= MIN_SCORE)
    .map(({ id, group, score }) => {
      const comments = group
        .map(record => toView(record, viewer.userId, viewer.authUid))
        .sort((a, b) => b.createdAt - a.createdAt)
      const { suburb, state = '', postcode = '' } = group[0]!
      const address = canonicalAddress(group[0]!.address)
      return {
        score,
        result: {
          id,
          displayAddress: titleCase(address),
          displayLocality: [titleCase(suburb), state.toUpperCase(), postcode].filter(Boolean).join(' '),
          links: propertyLinks({ address, suburb, state, postcode }),
          property: state && postcode ? { address, suburb, state, postcode } : null,
          latestAt: comments[0]?.createdAt ?? 0,
          comments,
        },
      }
    })
    .sort((a, b) => b.score - a.score || b.result.latestAt - a.result.latestAt)
    .slice(0, SEARCH_RESULTS)
    .map(({ result }) => result)
}

export async function createComment(
  property: PropertyInput,
  text: string,
  username: string,
  userId: string,
  replyToId?: string,
): Promise<CommentView> {
  const authUid = await ensureSignedIn()
  if (await isBanned(userId)) throw new UserError('You can’t post comments right now (error 90001).')

  const keys = buildPropertyKeys(property)
  const reply = replyToId ? await replyFields(replyToId, keys) : null
  const now = new Date()
  const data = {
    // A reply is stored under its parent's address spelling (which may be an older one), so the rules can check it
    // belongs to the same property
    address: reply?.address ?? keys.address,
    suburb: keys.suburb,
    state: keys.state,
    postcode: keys.postcode,
    url: property.url,
    text: text.trim(),
    timestamp: now.toISOString(),
    username: cleanUsername(username),
    uid: userId,
    authorAuthUid: authUid,
    createdAt: serverTimestamp(),
    ...(reply && { parentId: reply.parentId, replyToId: reply.replyToId }),
  }
  const ref = await addDoc(collection(db, COMMENTS), data)
  await invalidate(...COMMENT_CACHES)
  return {
    id: ref.id,
    text: data.text,
    username: data.username,
    createdAt: now.getTime(),
    votes: 0,
    hasVoted: false,
    isOwn: true,
    canDelete: true,
    editableUntil: now.getTime() + EDIT_WINDOW_MS,
    ...(reply && { parentId: reply.parentId, replyToId: reply.replyToId }),
  }
}

// Replies are one level deep, like Discord: replying to a reply puts the new reply under the same top-level comment,
// pointing at the reply it answers
async function replyFields(
  replyToId: string,
  keys: ReturnType<typeof buildPropertyKeys>,
): Promise<{ parentId: string; replyToId: string; address: string }> {
  const target = await getDoc(doc(db, COMMENTS, replyToId))
  if (!target.exists()) throw new UserError('The comment you’re replying to has been deleted.')
  const data = target.data() as CommentDoc
  if (data.suburb !== keys.suburb || !keys.addressVariants.includes(data.address)) {
    throw new UserError('You can only reply to comments on this property.')
  }
  if (!data.parentId) return { parentId: target.id, replyToId, address: data.address }
  const parent = await getDoc(doc(db, COMMENTS, data.parentId))
  if (!parent.exists())
    throw new UserError('This conversation’s first comment has been deleted, so it can’t be replied to.')
  return { parentId: parent.id, replyToId, address: (parent.data() as CommentDoc).address }
}

// The poster can change the text for EDIT_WINDOW_MS after posting; the rules enforce the same
export async function editComment(
  commentId: string,
  text: string,
  userId: string,
): Promise<{ text: string; editedAt: number }> {
  const authUid = await ensureSignedIn()
  if (await isBanned(userId)) throw new UserError('You can’t edit comments right now (error 90001).')
  const ref = doc(db, COMMENTS, commentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new UserError('This comment has been deleted.')
  const data = snap.data() as CommentDoc
  if (data.authorAuthUid !== authUid) throw new UserError('You can only edit your own comments.')
  if (!data.createdAt || Date.now() > data.createdAt.toMillis() + EDIT_WINDOW_MS) {
    throw new UserError('Comments can only be edited for 15 minutes after posting.')
  }
  const trimmed = text.trim()
  await updateDoc(ref, { text: trimmed, editedAt: serverTimestamp() })
  await invalidate(...COMMENT_CACHES)
  return { text: trimmed, editedAt: Date.now() }
}

// Upvotes a comment, or removes the user's upvote if they've already voted. A transaction, so simultaneous votes
// from different users can't overwrite each other.
export async function toggleVote(commentId: string, userId: string): Promise<{ votes: number; hasVoted: boolean }> {
  await ensureSignedIn()
  if (await isBanned(userId)) throw new UserError('You can’t vote right now (error 90001).')

  const ref = doc(db, COMMENTS, commentId)
  const result = await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new UserError('This comment has been deleted.')
    const data = snap.data() as CommentDoc
    if (data.uid === userId) throw new UserError('You can’t vote on your own comment.')

    const userVotes = { ...data.userVotes }
    const hasVoted = userVotes[userId] !== 'up'
    if (hasVoted) userVotes[userId] = 'up'
    else delete userVotes[userId]
    const votes = Math.max(0, (data.votes ?? 0) + (hasVoted ? 1 : -1))

    transaction.update(ref, { votes, userVotes })
    return { votes, hasVoted }
  })
  await invalidate(...COMMENT_CACHES)
  return result
}

export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const authUid = await ensureSignedIn()
  const ref = doc(db, COMMENTS, commentId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data() as CommentDoc
    if (data.authorAuthUid !== authUid) {
      throw new UserError(
        data.uid === userId
          ? 'Comments posted with older versions of the extension can’t be deleted.'
          : 'You can only delete your own comments.',
      )
    }
    await deleteDoc(ref)
  }
  await invalidate(...COMMENT_CACHES)
}

// Comment and property counts for a suburb (for its search results pages). One query on `suburb`, served by the
// automatic single-field index, capped like the search scan; postcodes are checked here, since the query can't.
export async function areaStats(area: Area): Promise<AreaStats> {
  const records = await cached(`area:${area.suburb}|${area.postcode}`, TTL.area, async () => {
    await ensureSignedIn()
    const snapshot = await getDocs(
      query(collection(db, COMMENTS), where('suburb', '==', area.suburb), limit(SEARCH_RECENT_SCAN)),
    )
    return snapshot.docs.map(toRecord)
  })
  // Old comments without a postcode are counted: the suburb and state are usually enough
  const here = records.filter(record => !record.postcode || record.postcode === area.postcode)
  return {
    comments: here.length,
    properties: new Set(here.map(record => canonicalAddress(record.address))).size,
    capped: records.length === SEARCH_RECENT_SCAN,
  }
}

// Reports go to a collection only the maintainer can read (with `pnpm moderate`). The document ID is the comment ID and
// the reporter's Auth UID, and the rules allow creating but never overwriting, so each person can report a comment
// once. Comment text isn't copied: the moderator reads the comment itself.
export async function reportComment(commentId: string, reason: ReportReason, details: string): Promise<void> {
  const authUid = await ensureSignedIn()
  try {
    await setDoc(doc(db, REPORTS, `${commentId}_${authUid}`), {
      commentId,
      reason,
      details,
      reporterAuthUid: authUid,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    // Writing over an existing report counts as an update, which the rules refuse; so does a deleted comment
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new UserError('Couldn’t send the report. You may have reported this comment already, or it’s been removed.')
    }
    throw error
  }
}

function isBanned(userId: string): Promise<boolean> {
  return cached(`banned:${userId}`, TTL.ban, async () => {
    const snapshot = await getDocs(query(collection(db, BANNED_USERS), where('uid', '==', userId), limit(1)))
    return !snapshot.empty
  })
}

function toRecord(snap: DocumentSnapshot): CommentRecord {
  const data = snap.data() as CommentDoc
  const createdAt = data.createdAt?.toMillis() ?? (data.timestamp ? Date.parse(data.timestamp) : NaN)
  const record: CommentRecord = {
    id: snap.id,
    address: data.address,
    suburb: data.suburb,
    text: typeof data.text === 'string' ? data.text : '',
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    votes: Math.max(0, data.votes ?? 0),
  }
  if (data.state) record.state = data.state
  if (data.postcode) record.postcode = data.postcode
  if (data.username) record.username = data.username
  if (data.uid) record.uid = data.uid
  if (data.authorAuthUid) record.authorAuthUid = data.authorAuthUid
  if (data.userVotes) record.userVotes = data.userVotes
  if (data.editedAt) record.editedAt = data.editedAt.toMillis()
  if (data.parentId) record.parentId = data.parentId
  if (data.replyToId) record.replyToId = data.replyToId
  return record
}

function toView(record: CommentRecord, userId: string, authUid: string): CommentView {
  const canDelete = record.authorAuthUid === authUid
  const view: CommentView = {
    id: record.id,
    text: record.text,
    username: record.username?.trim() || 'Anonymous',
    createdAt: record.createdAt,
    votes: record.votes,
    hasVoted: record.userVotes?.[userId] === 'up',
    isOwn: record.uid === userId,
    canDelete,
  }
  if (canDelete && record.createdAt) view.editableUntil = record.createdAt + EDIT_WINDOW_MS
  if (record.editedAt) view.editedAt = record.editedAt
  if (record.parentId) view.parentId = record.parentId
  if (record.replyToId) view.replyToId = record.replyToId
  return view
}
