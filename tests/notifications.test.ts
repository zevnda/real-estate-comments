import type { CommentView } from '../src/shared/messages'
import type { NotificationCandidate, NotificationsState } from '../src/shared/notifications'
import type { WatchedProperty } from '../src/shared/watchlist'

import { describe, expect, it } from 'vitest'

import {
  archiveAll,
  BACKLOG_MS,
  initialNotifications,
  markRead,
  markWatchedSeen,
  MAX_NOTIFICATIONS,
  mergeNotifications,
  replyCandidates,
  SHOWN_NOTIFICATIONS,
  shownNotifications,
  watchCandidates,
} from '../src/shared/notifications'
import { watchKey } from '../src/shared/watchlist'

const NOW = Date.UTC(2026, 9, 12)
const PROPERTY = {
  address: '46 stanley road',
  suburb: 'epping',
  state: 'nsw',
  postcode: '2121',
  displayAddress: '46 Stanley Road',
  displayLocality: 'Epping NSW 2121',
}

function candidate(
  id: string,
  createdAt: number,
  kind: NotificationCandidate['kind'] = 'reply',
): NotificationCandidate {
  return { id, kind, username: 'Sam', text: 'Text', createdAt, property: PROPERTY }
}

function comment(id: string, createdAt: number, isOwn = false): CommentView {
  return { id, text: 'Text', username: 'Sam', createdAt, votes: 0, hasVoted: false, isOwn, canDelete: isOwn }
}

describe('mergeNotifications', () => {
  it('adds new candidates as unread, newest first', () => {
    const state = mergeNotifications(initialNotifications(NOW), [
      candidate('a', NOW - 2000),
      candidate('b', NOW - 1000),
    ])
    expect(state.items.map(item => [item.id, item.read])).toEqual([
      ['b', false],
      ['a', false],
    ])
  })

  it('starts with the last week, not everything', () => {
    const state = mergeNotifications(initialNotifications(NOW), [candidate('old', NOW - BACKLOG_MS - 1)])
    expect(state.items).toEqual([])
  })

  it('never adds the same comment twice, so a read one stays read', () => {
    const first = markRead(mergeNotifications(initialNotifications(NOW), [candidate('a', NOW)]))
    const second = mergeNotifications(first, [candidate('a', NOW)])
    expect(second).toBe(first)
    expect(second.items[0]!.read).toBe(true)
  })

  it('shows a comment that is both a reply and on a watched property as the reply', () => {
    const state = mergeNotifications(initialNotifications(NOW), [
      candidate('a', NOW, 'watch'),
      candidate('a', NOW, 'reply'),
    ])
    expect(state.items.map(item => item.kind)).toEqual(['reply'])
  })

  it('keeps the newest, and never brings back ones that were trimmed', () => {
    const many = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, i) => candidate(`c${i}`, NOW - i * 1000))
    const state = mergeNotifications(initialNotifications(NOW), many)
    expect(state.items).toHaveLength(MAX_NOTIFICATIONS)
    expect(state.items.at(-1)!.id).toBe(`c${MAX_NOTIFICATIONS - 1}`)
    expect(mergeNotifications(state, [candidate(`c${MAX_NOTIFICATIONS}`, NOW - MAX_NOTIFICATIONS * 1000)])).toBe(state)
  })

  it('returns the same state when nothing is new, so nothing is written', () => {
    const state: NotificationsState = initialNotifications(NOW)
    expect(mergeNotifications(state, [])).toBe(state)
  })
})

describe('markRead', () => {
  it('marks one or all', () => {
    const state = mergeNotifications(initialNotifications(NOW), [candidate('a', NOW), candidate('b', NOW - 1)])
    expect(markRead(state, ['a']).items.map(item => item.read)).toEqual([true, false])
    expect(markRead(state).items.every(item => item.read)).toBe(true)
    const all = markRead(state)
    expect(markRead(all)).toBe(all)
  })
})

describe('watched properties', () => {
  const watched: WatchedProperty = { ...PROPERTY, key: watchKey(PROPERTY), addedAt: NOW - 10_000, seenAt: NOW - 5000 }

  it('turns other people’s comments since the user last looked into candidates', () => {
    const candidates = watchCandidates([watched], {
      [watched.key]: [comment('new', NOW - 1000), comment('seen', NOW - 6000), comment('mine', NOW, true)],
    })
    expect(candidates.map(c => [c.id, c.kind])).toEqual([['new', 'watch']])
  })

  it('marks them read once the property has been seen', () => {
    const state = mergeNotifications(initialNotifications(NOW), [
      candidate('w', NOW - 1000, 'watch'),
      candidate('r', NOW - 1000),
    ])
    expect(markWatchedSeen(state, [watched]).items.every(item => !item.read)).toBe(true)
    const seen = markWatchedSeen(state, [{ ...watched, seenAt: NOW }])
    expect(seen.items.map(item => [item.id, item.read])).toEqual([
      ['w', true],
      ['r', false],
    ])
  })
})

describe('replyCandidates', () => {
  it('names direct replies and replies in the user’s threads, and leaves out ones it can’t open', () => {
    const candidates = replyCandidates([
      { comment: comment('direct', NOW), direct: true, property: PROPERTY },
      { comment: comment('thread', NOW), direct: false, property: PROPERTY },
      { comment: comment('old', NOW), direct: true, property: null },
    ])
    expect(candidates.map(c => [c.id, c.kind])).toEqual([
      ['direct', 'reply'],
      ['thread', 'thread'],
    ])
  })
})

describe('the bell', () => {
  const many = Array.from({ length: 8 }, (_, i) => candidate(`c${i}`, NOW - i * 1000))

  it('shows only the newest few', () => {
    const state = mergeNotifications(initialNotifications(NOW), many)
    expect(shownNotifications(state.items).map(item => item.id)).toEqual(
      many.slice(0, SHOWN_NOTIFICATIONS).map(item => item.id),
    )
  })

  it('archives everything, read, without letting it come back', () => {
    const archived = archiveAll(mergeNotifications(initialNotifications(NOW), many))
    expect(shownNotifications(archived.items)).toEqual([])
    expect(archived.items.every(item => item.read && item.archived)).toBe(true)
    expect(mergeNotifications(archived, many)).toBe(archived)
    expect(archiveAll(archived)).toBe(archived)
    // Newer ones show again
    const next = mergeNotifications(archived, [candidate('new', NOW + 1000)])
    expect(shownNotifications(next.items).map(item => item.id)).toEqual(['new'])
  })
})
