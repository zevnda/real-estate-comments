import type { CommentView } from './messages'
import type { WatchedProperty } from './watchlist'

import { getStored, setStored } from './storage'
import { watchKey } from './watchlist'

// Notifications in the panel's bell: replies to the user's comments, and new comments on watched properties. Nothing
// runs in the background: the panel checks when it opens and every CHECK_INTERVAL_MS while it's open, and the list is
// kept in `storage.local`.

// reply: answers one of the user's comments; thread: a reply under the user's top-level comment, answering someone
// else; watch: a new comment on a watched property
export type NotificationKind = 'reply' | 'thread' | 'watch'

// The property a notification is about: enough to show it and look up its comments
export interface NotificationProperty {
  address: string
  titleAddress?: string
  suburb: string
  state: string
  postcode: string
  displayAddress: string
  displayLocality: string
}

export interface AppNotification {
  // The comment's ID
  id: string
  kind: NotificationKind
  username: string
  // The start of the comment
  text: string
  createdAt: number
  property: NotificationProperty
  read: boolean
}

export type NotificationCandidate = Omit<AppNotification, 'read'>

export interface NotificationsState {
  // Newest first
  items: AppNotification[]
  // Comments at or before this (ms) never become notifications: ones trimmed off the list, and on the first check,
  // anything older than BACKLOG_MS
  since: number
}

export const MAX_NOTIFICATIONS = 50
export const CHECK_INTERVAL_MS = 5 * 60 * 1000
// On the first check, replies from the last week are shown, so the feature starts with something useful
export const BACKLOG_MS = 7 * 24 * 60 * 60 * 1000
// Stored text is cut to this; the list only shows a line or two
const TEXT_LENGTH = 200

// A comment that's both a reply to the user and on a watched property is shown as the reply
const PRIORITY: Record<NotificationKind, number> = { reply: 0, thread: 1, watch: 2 }

// Before the first check
export function initialNotifications(now: number): NotificationsState {
  return { items: [], since: now - BACKLOG_MS }
}

// Adds new candidates as unread. Returns `current` itself when nothing changes, so callers can skip writing.
export function mergeNotifications(
  current: NotificationsState,
  candidates: NotificationCandidate[],
): NotificationsState {
  const known = new Set(current.items.map(item => item.id))
  const added = new Map<string, NotificationCandidate>()
  for (const candidate of candidates) {
    if (candidate.createdAt <= current.since || known.has(candidate.id)) continue
    const existing = added.get(candidate.id)
    if (!existing || PRIORITY[candidate.kind] < PRIORITY[existing.kind]) added.set(candidate.id, candidate)
  }
  if (!added.size) return current

  const items = [
    ...current.items,
    ...[...added.values()].map(candidate => ({
      ...candidate,
      text: candidate.text.slice(0, TEXT_LENGTH),
      read: false,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt)
  const dropped = items.slice(MAX_NOTIFICATIONS)
  return {
    items: items.slice(0, MAX_NOTIFICATIONS),
    since: Math.max(current.since, ...dropped.map(item => item.createdAt)),
  }
}

// `ids`: which to mark read, or all of them
export function markRead(state: NotificationsState, ids?: string[]): NotificationsState {
  const marks = (item: AppNotification) => !item.read && (!ids || ids.includes(item.id))
  if (!state.items.some(marks)) return state
  return { ...state, items: state.items.map(item => (marks(item) ? { ...item, read: true } : item)) }
}

// New comments on a watched property stop being news once the user has seen them in the Watchlist or on its page
export function markWatchedSeen(state: NotificationsState, watchlist: WatchedProperty[]): NotificationsState {
  const seen = new Map(watchlist.map(item => [item.key, item.seenAt]))
  return markRead(
    state,
    state.items
      .filter(item => item.kind === 'watch' && item.createdAt <= (seen.get(watchKey(item.property)) ?? 0))
      .map(item => item.id),
  )
}

// Replies the background found, as candidates. Old comments without a state or postcode can't be opened, so are left out.
export function replyCandidates(
  notices: { comment: CommentView; direct: boolean; property: NotificationProperty | null }[],
): NotificationCandidate[] {
  return notices.flatMap(({ comment, direct, property }) =>
    property && !comment.isOwn
      ? [
          {
            id: comment.id,
            kind: direct ? ('reply' as const) : ('thread' as const),
            username: comment.username,
            text: comment.text,
            createdAt: comment.createdAt,
            property,
          },
        ]
      : [],
  )
}

// Comments by others on watched properties, since the user last looked at each
export function watchCandidates(
  watchlist: WatchedProperty[],
  comments: Record<string, CommentView[] | undefined>,
): NotificationCandidate[] {
  return watchlist.flatMap(item => {
    const { address, titleAddress, suburb, state, postcode, displayAddress, displayLocality } = item
    const property = {
      address,
      ...(titleAddress && { titleAddress }),
      suburb,
      state,
      postcode,
      displayAddress,
      displayLocality,
    }
    return (comments[item.key] ?? [])
      .filter(comment => !comment.isOwn && comment.createdAt > item.seenAt)
      .map(comment => ({
        id: comment.id,
        kind: 'watch' as const,
        username: comment.username,
        text: comment.text,
        createdAt: comment.createdAt,
        property,
      }))
  })
}

export async function getNotifications(): Promise<NotificationsState | undefined> {
  return getStored('notifications')
}

// Read, change and write back, one change at a time, so the reply and watchlist checks can't overwrite each other.
// Other tabs see the change through storage.onChanged.
let queue: Promise<unknown> = Promise.resolve()
export function updateNotifications(
  change: (state: NotificationsState) => NotificationsState,
): Promise<NotificationsState> {
  const next = queue.then(async () => {
    const stored = await getNotifications()
    const changed = change(stored ?? initialNotifications(Date.now()))
    if (changed !== stored) await setStored('notifications', changed)
    return changed
  })
  queue = next.catch(() => {})
  return next
}
