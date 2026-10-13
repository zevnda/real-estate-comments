import type { CommitResult, Firestore, FirestoreDocument, Write } from '../worker/src/firestore'
import type { RelayDeps } from '../worker/src/relay'

import { describe, expect, it } from 'vitest'

import { DAY } from '../src/shared/rate-limit'
import { parseChallengeMessage } from '../src/shared/relay'
import { decodeFields, encodeFields, FirestoreError } from '../worker/src/firestore'
import { ipKey, ipNetwork } from '../worker/src/ip'
import {
  deleteExpiredRecords,
  editComment,
  fieldPath,
  GLOBAL_PER_HOUR,
  NETWORK_LIMITS,
  postComment,
  RelayError,
  repeatKey,
  reportComment,
  toggleVote,
} from '../worker/src/relay'

describe('ipNetwork', () => {
  it('keeps IPv4 addresses whole', () => {
    expect(ipNetwork('203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetwork(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(ipNetwork('256.0.0.1')).toBeNull()
  })

  it('reduces IPv6 addresses to their /64, however they’re written', () => {
    const network = '2001:db8:85a3:8d3::/64'
    expect(ipNetwork('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(network)
    expect(ipNetwork('2001:0db8:85a3:08d3:0000:0000:0000:0001')).toBe(network)
    expect(ipNetwork('2001:db8:85a3:8d3::1')).toBe(network)
    expect(ipNetwork('2001:DB8:85A3:8D3:ffff::')).toBe(network)
    expect(ipNetwork('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(ipNetwork('::1')).toBe('0:0:0:0::/64')
  })

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(ipNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetwork('::ffff:cb00:7107')).toBe('203.0.113.7')
  })

  it('rejects anything else', () => {
    for (const bad of ['', 'localhost', '1.2.3', '1:2:3:4:5:6:7:8:9', '1::2::3', '12345::', 'g::1']) {
      expect(ipNetwork(bad)).toBeNull()
    }
  })
})

describe('ipKey', () => {
  it('is stable for a network and secret, and differs with either', async () => {
    const key = await ipKey('203.0.113.7', 'secret')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(await ipKey('203.0.113.7', 'secret')).toBe(key)
    expect(await ipKey('203.0.113.8', 'secret')).not.toBe(key)
    expect(await ipKey('203.0.113.7', 'other')).not.toBe(key)
  })
})

describe('parseChallengeMessage', () => {
  const send = (message: object) => JSON.stringify({ source: 'rec-challenge', ...message })

  it('reads the challenge page’s messages', () => {
    expect(parseChallengeMessage(send({ type: 'token', token: 'abc' }))).toEqual({
      source: 'rec-challenge',
      type: 'token',
      token: 'abc',
    })
    expect(parseChallengeMessage(send({ type: 'interactive', on: true }))?.type).toBe('interactive')
    expect(parseChallengeMessage(send({ type: 'error', code: 110200 }))).toMatchObject({ code: '110200' })
  })

  it('ignores anything else posted to the page', () => {
    expect(parseChallengeMessage({ source: 'rec-challenge', type: 'token', token: 'abc' })).toBeNull()
    expect(parseChallengeMessage('not json')).toBeNull()
    expect(parseChallengeMessage(JSON.stringify({ type: 'token', token: 'abc' }))).toBeNull()
    expect(parseChallengeMessage(send({ type: 'token', token: '' }))).toBeNull()
    expect(parseChallengeMessage(send({ type: 'something' }))).toBeNull()
  })
})

describe('Firestore values', () => {
  it('round-trip', () => {
    const data = {
      text: 'hi',
      count: 3,
      ratio: 0.5,
      flag: true,
      none: null,
      at: new Date('2026-10-13T00:00:00.000Z'),
      list: [{ at: 1, property: 'x' }],
    }
    expect(encodeFields(data).count).toEqual({ integerValue: '3' })
    expect(decodeFields(encodeFields(data))).toEqual(data)
  })
})

// An in-memory Firestore with the REST API's write semantics: preconditions, and server timestamps
function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  let clock = 0
  const docs = new Map<string, { fields: Record<string, unknown>; updateTime: string }>()
  for (const [path, fields] of Object.entries(initial)) docs.set(path, { fields, updateTime: String(++clock) })
  const root = 'projects/test/databases/(default)/documents/'
  let commits = 0
  let beforeCommit: (() => void) | null = null
  const firestore: Firestore = {
    name: path => root + path,
    async get(path): Promise<FirestoreDocument | null> {
      const doc = docs.get(path)
      return doc ? { fields: structuredClone(doc.fields), updateTime: doc.updateTime } : null
    },
    async listBefore(collection, field, before, limit) {
      return [...docs.entries()]
        .filter(([path, doc]) => {
          const value = doc.fields[field]
          return path.startsWith(`${collection}/`) && value instanceof Date && value < before
        })
        .slice(0, limit)
        .map(([path, doc]) => ({ name: root + path, updateTime: doc.updateTime }))
    },
    async exists(collection, field, op, value) {
      return [...docs.entries()].some(([path, doc]) => {
        const stored = doc.fields[field]
        return (
          path.startsWith(`${collection}/`) &&
          (op === 'EQUAL' ? stored === value : Array.isArray(stored) && stored.includes(value))
        )
      })
    },
    async commit(writes: Write[]): Promise<CommitResult> {
      commits++
      beforeCommit?.()
      beforeCommit = null
      const path = (write: Write) => ('delete' in write ? write.delete : write.update.name).slice(root.length)
      for (const write of writes) {
        const existing = docs.get(path(write))
        const condition = write.currentDocument
        if (condition && 'exists' in condition && condition.exists !== !!existing) {
          throw new FirestoreError('precondition', condition.exists ? 'NOT_FOUND' : 'ALREADY_EXISTS')
        }
        if (condition && 'updateTime' in condition && existing?.updateTime !== condition.updateTime) {
          throw new FirestoreError('precondition', 'FAILED_PRECONDITION')
        }
      }
      const time = new Date(Date.UTC(2026, 9, 13, 0, 0, ++clock)).toISOString()
      return {
        commitTime: time,
        writeResults: writes.map(write => {
          if ('delete' in write) {
            docs.delete(path(write))
            return {}
          }
          const changed = decodeFields(write.update.fields)
          // With a mask, only those fields change, and masked fields missing from `fields` are removed
          const fields = write.updateMask
            ? applyMask(docs.get(path(write))?.fields ?? {}, changed, write.updateMask.fieldPaths)
            : changed
          for (const transform of write.updateTransforms ?? []) fields[transform.fieldPath] = new Date(time)
          docs.set(write.update.name.slice(root.length), { fields, updateTime: time })
          return { updateTime: time, transformResults: write.updateTransforms?.map(() => ({ timestampValue: time })) }
        }),
      }
    },
  }
  return {
    firestore,
    docs,
    commits: () => commits,
    // Simulates another post landing between this one's read and its commit
    interfere: (change: () => void) => (beforeCommit = change),
  }
}

// Firestore's update mask semantics, for the fake: each path is set from `changed`, or removed if it isn't there
function applyMask(
  existing: Record<string, unknown>,
  changed: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  const result = structuredClone(existing)
  for (const path of paths) {
    const segments = [...path.matchAll(/`((?:[^`\\]|\\.)*)`|([^.`]+)/g)].map(([, quoted, plain]) =>
      quoted === undefined ? plain! : quoted.replace(/\\(.)/g, '$1'),
    )
    let source: unknown = changed
    let target = result
    for (const segment of segments.slice(0, -1)) {
      source = (source as Record<string, unknown> | undefined)?.[segment]
      target = (target[segment] ??= {}) as Record<string, unknown>
    }
    const last = segments.at(-1)!
    const value = (source as Record<string, unknown> | undefined)?.[last]
    if (value === undefined) delete target[last]
    else target[last] = value
  }
  return result
}

const property = {
  address: '46 Stanley Rd',
  suburb: 'Epping',
  state: 'nsw',
  postcode: '2121',
  url: 'https://www.domain.com.au/property-profile/46-stanley-road-epping-nsw-2121',
}

function post(body: Record<string, unknown> = {}, token: string | null = 'id-token'): Request {
  return new Request('https://relay.test/comment', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({
      property,
      text: 'Mould in the bathroom.',
      username: ' Jane ',
      userId: 'extension-user',
      turnstileToken: 'turnstile-token',
      ...body,
    }),
  })
}

function deps(firestore: Firestore, overrides: Partial<RelayDeps> = {}): RelayDeps {
  return {
    firestore,
    verifyTurnstile: async token => token === 'turnstile-token',
    verifyIdToken: async token => (token === 'id-token' ? 'auth-uid' : null),
    networkKey: 'network',
    secret: 'secret',
    now: () => Date.UTC(2026, 9, 13),
    afterResponse: () => {},
    ...overrides,
  }
}

describe('postComment', () => {
  it('writes the comment with the same fields the extension used to', async () => {
    const db = fakeFirestore()
    const result = await postComment(post(), deps(db.firestore))
    expect(result.id).toMatch(/^[A-Za-z0-9]{20}$/)
    expect(result.createdAt).toBeGreaterThan(0)
    const saved = db.docs.get(`listingcomments/${result.id}`)!.fields
    expect(saved).toEqual({
      address: '46 stanley road',
      suburb: 'epping',
      state: 'nsw',
      postcode: '2121',
      url: property.url,
      text: 'Mould in the bathroom.',
      timestamp: '2026-10-13T00:00:00.000Z',
      username: 'Jane',
      uid: 'extension-user',
      authorAuthUid: 'auth-uid',
      createdAt: new Date(result.createdAt),
    })
    // The network's record: no address or comment text, and it deletes itself
    const limits = db.docs.get('rateLimits/network')!.fields
    expect(Object.keys(limits).sort()).toEqual(['edits', 'expireAt', 'posts', 'reports', 'votes'])
    expect(JSON.stringify(limits)).not.toMatch(/stanley|epping/i)
  })

  it('refuses posts without a valid Turnstile token or sign-in, before writing anything', async () => {
    const db = fakeFirestore()
    await expect(postComment(post({ turnstileToken: 'stale' }), deps(db.firestore))).rejects.toMatchObject({
      status: 403,
    })
    await expect(postComment(post({}, 'forged'), deps(db.firestore))).rejects.toMatchObject({ status: 401 })
    await expect(postComment(post({}, null), deps(db.firestore))).rejects.toMatchObject({ status: 401 })
    expect(db.commits()).toBe(0)
  })

  it('validates the comment without spending the Turnstile token', async () => {
    let turnstileChecks = 0
    const check = deps(fakeFirestore().firestore, {
      verifyTurnstile: async () => {
        turnstileChecks++
        return true
      },
    })
    await expect(postComment(post({ text: 'hi' }), check)).rejects.toThrow(/at least/)
    await expect(postComment(post({ property: { ...property, url: 'https://evil.example/' } }), check)).rejects.toThrow(
      /address/,
    )
    await expect(postComment(post({ userId: '../x' }), check)).rejects.toBeInstanceOf(RelayError)
    await expect(postComment(post({ replyTo: 'a/b' }), check)).rejects.toThrow(/reply/)
    expect(turnstileChecks).toBe(0)
  })

  it('limits posts per network, with a wait between them', async () => {
    const db = fakeFirestore()
    const at = (minutes: number) => deps(db.firestore, { now: () => Date.UTC(2026, 9, 13) + minutes * 60_000 })
    const numbered = (n: number) => post({ text: `Comment number ${n}` })
    await postComment(numbered(0), at(0))
    await expect(postComment(numbered(1), at(0.25))).rejects.toThrow('Please wait 45 seconds before posting again.')
    for (let i = 1; i < NETWORK_LIMITS.perHour; i++) await postComment(numbered(i), at(i))
    await expect(postComment(numbered(99), at(30))).rejects.toMatchObject({ status: 429 })
    // Another network isn't affected
    await postComment(numbered(100), deps(db.firestore, { networkKey: 'other', now: () => Date.UTC(2026, 9, 13) }))
    // An hour later it can post again, up to the daily limit
    let minute = 61
    for (let i = NETWORK_LIMITS.perHour; i < NETWORK_LIMITS.perDay; i++) {
      await postComment(numbered(i), at(minute))
      minute += i % NETWORK_LIMITS.perHour === NETWORK_LIMITS.perHour - 1 ? 61 : 1
    }
    await expect(postComment(numbered(200), at(minute + 120))).rejects.toThrow(/a day/)
  })

  it('limits posts across everyone', async () => {
    const db = fakeFirestore()
    const now = Date.UTC(2026, 9, 13)
    for (let i = 0; i < GLOBAL_PER_HOUR; i++) {
      await postComment(
        post({ text: `Comment number ${i}` }),
        deps(db.firestore, { networkKey: `n${i}`, now: () => now + i }),
      )
    }
    const next = (minutes: number) =>
      postComment(
        post({ text: 'One more' }),
        deps(db.firestore, { networkKey: 'late', now: () => now + minutes * 60_000 }),
      )
    await expect(next(30)).rejects.toMatchObject({ status: 503 })
    await next(61)
  })

  it('refuses the same text again for a week, from anyone', async () => {
    const db = fakeFirestore()
    const now = Date.UTC(2026, 9, 13)
    const text = 'Great place, but the landlord never fixed the heater.'
    const from = (networkKey: string, days: number) => deps(db.firestore, { networkKey, now: () => now + days * DAY })
    await postComment(post({ text }), from('a', 0))
    // Spacing, case and punctuation don't make it new
    await expect(postComment(post({ text: `  ${text.toUpperCase()}!! ` }), from('b', 1))).rejects.toMatchObject({
      status: 409,
    })
    await postComment(post({ text }), from('c', 8))
    // Short texts are often written independently, so they can repeat
    await postComment(post({ text: 'Same here!' }), from('d', 9))
    await postComment(post({ text: 'Same here!' }), from('e', 9))
    // The stored key doesn't reveal the text
    expect(await repeatKey(text, 'secret')).toMatch(/^[0-9a-f]{64}$/)
    expect(await repeatKey('Same here!', 'secret')).toBeNull()
  })

  it('retries when another post lands at the same moment', async () => {
    const db = fakeFirestore()
    db.interfere(() => db.docs.set('rateLimits/everyone', { fields: { posts: [] }, updateTime: 'other' }))
    await postComment(post(), deps(db.firestore))
    expect(db.commits()).toBe(2)
  })

  it('deletes expired records after posting', async () => {
    const now = Date.UTC(2026, 9, 13)
    const expiring = (hours: number) => ({ expireAt: new Date(now + hours * 3_600_000) })
    const db = fakeFirestore({
      'rateLimits/old': { posts: [], ...expiring(-1) },
      'rateLimits/older': { posts: [], ...expiring(-48) },
      'rateLimits/recent': { posts: [], ...expiring(1) },
      'recentTexts/old': expiring(-1),
      'recentTexts/recent': expiring(24),
    })
    const tasks: Promise<unknown>[] = []
    await postComment(post(), deps(db.firestore, { afterResponse: task => tasks.push(task) }))
    await Promise.all(tasks)
    const left = [...db.docs.keys()].filter(path => /^(rateLimits|recentTexts)\//.test(path)).sort()
    expect(left).toEqual(['rateLimits/everyone', 'rateLimits/network', 'rateLimits/recent', 'recentTexts/recent'])
    expect(await deleteExpiredRecords(db.firestore, now)).toBe(0)
  })

  it('puts replies under the thread’s first comment, on the same property', async () => {
    const stored = { address: '46 stanley rd', suburb: 'epping', text: 'Top', createdAt: new Date() }
    const db = fakeFirestore({
      'listingcomments/top': stored,
      'listingcomments/reply1': { ...stored, parentId: 'top', replyToId: 'top' },
      'listingcomments/elsewhere': { ...stored, suburb: 'kew' },
    })
    const later = (minutes: number) => deps(db.firestore, { now: () => Date.UTC(2026, 9, 13) + minutes * 60_000 })
    const reply = await postComment(post({ replyTo: 'reply1' }), later(0))
    expect(reply).toMatchObject({ parentId: 'top', replyToId: 'reply1' })
    // Stored under the parent's spelling of the address, so the property's query finds it
    expect(db.docs.get(`listingcomments/${reply.id}`)!.fields.address).toBe('46 stanley rd')
    await expect(postComment(post({ replyTo: 'elsewhere' }), later(1))).rejects.toThrow(/this property/)
    await expect(postComment(post({ replyTo: 'missing' }), later(2))).rejects.toThrow(/deleted/)
  })
})

// An edit or report request, signed in as auth-uid unless another token is given
function send(path: string, body: Record<string, unknown>, token = 'id-token'): Request {
  return new Request(`https://relay.test${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: 'extension-user', ...body }),
  })
}

describe('editComment', () => {
  const now = Date.UTC(2026, 9, 13)
  const comment = (fields: Record<string, unknown> = {}) => ({
    address: '46 stanley road',
    suburb: 'epping',
    text: 'The original comment, about the heater.',
    authorAuthUid: 'auth-uid',
    createdAt: new Date(now - 60_000),
    votes: 2,
    ...fields,
  })
  const at = (db: ReturnType<typeof fakeFirestore>, seconds = 0) =>
    deps(db.firestore, { now: () => now + seconds * 1000 })

  it('changes only the text, and marks it edited', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment() })
    const edit = await editComment(
      send('/edit', { commentId: 'c1', text: '  Edited: the heater was fixed.  ' }),
      at(db),
    )
    expect(edit.text).toBe('Edited: the heater was fixed.')
    const saved = db.docs.get('listingcomments/c1')!.fields
    expect(saved).toMatchObject({ text: 'Edited: the heater was fixed.', votes: 2, authorAuthUid: 'auth-uid' })
    expect(saved.editedAt).toEqual(new Date(edit.editedAt))
  })

  it('only lets the author edit, within 15 minutes', async () => {
    const db = fakeFirestore({
      'listingcomments/theirs': comment({ authorAuthUid: 'someone-else' }),
      'listingcomments/old': comment({ createdAt: new Date(now - 16 * 60_000) }),
      'listingcomments/legacy': comment({ authorAuthUid: undefined }),
    })
    const edit = (commentId: string) => editComment(send('/edit', { commentId, text: 'New text here.' }), at(db))
    await expect(edit('theirs')).rejects.toThrow(/your own/)
    await expect(edit('old')).rejects.toThrow(/15 minutes/)
    await expect(edit('legacy')).rejects.toThrow(/your own/)
    await expect(edit('missing')).rejects.toThrow(/deleted/)
    await expect(
      editComment(send('/edit', { commentId: 'c1', text: 'New text here.' }, 'forged'), at(db)),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('checks the new text like a new comment', async () => {
    const spam = Array.from({ length: 9 }, (_, i) => `https://spam.example/${i}`).join(' ')
    const posted = 'Someone else already wrote exactly this comment.'
    const db = fakeFirestore({ 'listingcomments/c1': comment() })
    await postComment(post({ text: posted }), deps(db.firestore, { networkKey: 'other', now: () => now }))
    await expect(editComment(send('/edit', { commentId: 'c1', text: spam }), at(db))).rejects.toThrow(/8 links/)
    await expect(editComment(send('/edit', { commentId: 'c1', text: posted }), at(db))).rejects.toMatchObject({
      status: 409,
    })
    // Fixing your own comment's punctuation isn't a repeat of it
    await editComment(send('/edit', { commentId: 'c1', text: 'The original comment about the heater!' }), at(db))
  })

  it('limits edits per network', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment() })
    const edit = (n: number, seconds: number) =>
      editComment(send('/edit', { commentId: 'c1', text: `Edit number ${n}` }), at(db, seconds))
    await edit(1, 0)
    await expect(edit(2, 5)).rejects.toThrow('Please wait 5 seconds before editing again.')
    await edit(2, 10)
  })
})

describe('reportComment', () => {
  const now = Date.UTC(2026, 9, 13)
  const report = (commentId: string, token = 'id-token', reason = 'spam') =>
    send('/report', { commentId, reason, details: ' Looks like spam. ' }, token)

  it('stores the report the moderation tool reads', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': { text: 'x' } })
    await reportComment(report('c1'), deps(db.firestore))
    expect(db.docs.get('reports/c1_auth-uid')!.fields).toEqual({
      commentId: 'c1',
      reason: 'spam',
      details: 'Looks like spam.',
      reporterAuthUid: 'auth-uid',
      createdAt: expect.any(Date) as Date,
    })
  })

  it('refuses unknown reasons, long details and removed comments', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': { text: 'x' } })
    await expect(reportComment(report('c1', 'id-token', 'boring'), deps(db.firestore))).rejects.toThrow(/Choose/)
    await expect(
      reportComment(
        send('/report', { commentId: 'c1', reason: 'spam', details: 'x'.repeat(1001) }),
        deps(db.firestore),
      ),
    ).rejects.toThrow(/1000/)
    await expect(reportComment(report('gone'), deps(db.firestore))).rejects.toThrow(/removed/)
  })

  it('allows one report of a comment per person and per network', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': { text: 'x' }, 'listingcomments/c2': { text: 'y' } })
    const as = (authUid: string, networkKey: string, seconds = 0) =>
      deps(db.firestore, {
        networkKey,
        verifyIdToken: async () => authUid,
        now: () => now + seconds * 1000,
      })
    await reportComment(report('c1'), as('alice', 'home'))
    await expect(reportComment(report('c1'), as('alice', 'work', 20))).rejects.toMatchObject({ status: 409 })
    // A fresh anonymous account on the same network
    await expect(reportComment(report('c1'), as('fresh', 'home', 20))).rejects.toMatchObject({ status: 409 })
    await reportComment(report('c2'), as('fresh', 'home', 20))
    await reportComment(report('c1'), as('bob', 'elsewhere'))
  })
})

describe('fieldPath', () => {
  it('quotes segments that aren’t plain identifiers', () => {
    expect(fieldPath('votes')).toBe('votes')
    expect(fieldPath('userVotes', '3488771f-e471-47a6')).toBe('userVotes.`3488771f-e471-47a6`')
    // A backtick or backslash in a segment is escaped with a backslash
    expect(fieldPath('a', 'b`c\\d')).toBe('a.`b\\`c\\\\d`')
  })
})

describe('toggleVote', () => {
  const now = Date.UTC(2026, 9, 13)
  const comment = (fields: Record<string, unknown> = {}) => ({
    text: 'A comment',
    uid: 'poster-uid',
    authorAuthUid: 'poster-auth',
    ...fields,
  })
  // A voter: their Auth UID and network
  const voter = (db: ReturnType<typeof fakeFirestore>, authUid: string, networkKey: string, seconds = 0) =>
    deps(db.firestore, { verifyIdToken: async () => authUid, networkKey, now: () => now + seconds * 1000 })
  const vote = (commentId: string, userId: string) => send('/vote', { commentId, userId })

  it('upvotes, and takes the upvote back', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment({ votes: 1, userVotes: { someone: 'up' } }) })
    expect(await toggleVote(vote('c1', 'alice-uid'), voter(db, 'alice', 'home'))).toEqual({ votes: 2, hasVoted: true })
    expect(db.docs.get('listingcomments/c1')!.fields.userVotes).toEqual({ 'someone': 'up', 'alice-uid': 'up' })
    expect(await toggleVote(vote('c1', 'alice-uid'), voter(db, 'alice', 'home', 2))).toEqual({
      votes: 1,
      hasVoted: false,
    })
    expect(db.docs.get('listingcomments/c1')!.fields.userVotes).toEqual({ someone: 'up' })
    // The private vote record is gone too, so the network can vote again
    expect([...db.docs.keys()].some(path => path.startsWith('votes/'))).toBe(false)
  })

  it('allows one upvote per comment per network, however many accounts', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment(), 'listingcomments/c2': comment() })
    await toggleVote(vote('c1', 'alice-uid'), voter(db, 'alice', 'home'))
    // A reinstall: a new Auth UID and extension ID, on the same connection
    await expect(toggleVote(vote('c1', 'new-uid'), voter(db, 'new-auth', 'home', 2))).rejects.toMatchObject({
      status: 409,
    })
    // Other comments, and other networks, are fine
    await toggleVote(vote('c2', 'new-uid'), voter(db, 'new-auth', 'home', 4))
    await toggleVote(vote('c1', 'bob-uid'), voter(db, 'bob', 'elsewhere'))
    expect(db.docs.get('listingcomments/c1')!.fields.votes).toBe(2)
    // The vote records don't name the network
    expect(JSON.stringify([...db.docs.entries()].filter(([path]) => path.startsWith('votes/')))).not.toMatch(/home/)
  })

  it('refuses votes on your own comment', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment() })
    await expect(toggleVote(vote('c1', 'poster-uid'), voter(db, 'other-auth', 'home'))).rejects.toThrow(/own comment/)
    await expect(toggleVote(vote('c1', 'other-uid'), voter(db, 'poster-auth', 'home'))).rejects.toThrow(/own comment/)
    await expect(toggleVote(vote('gone', 'alice-uid'), voter(db, 'alice', 'home'))).rejects.toThrow(/deleted/)
  })

  it('lets votes from before the relay be taken back', async () => {
    const db = fakeFirestore({ 'listingcomments/c1': comment({ votes: 2, userVotes: { 'old-uid': 'up', 'x': 'up' } }) })
    // Someone else on the network has voted through the relay since
    await toggleVote(vote('c1', 'bob-uid'), voter(db, 'bob', 'home'))
    expect(await toggleVote(vote('c1', 'old-uid'), voter(db, 'old-auth', 'home', 2))).toEqual({
      votes: 2,
      hasVoted: false,
    })
    expect(db.docs.get('listingcomments/c1')!.fields.userVotes).toEqual({ 'x': 'up', 'bob-uid': 'up' })
  })
})

describe('bans', () => {
  const now = Date.UTC(2026, 9, 13)
  const at = (db: ReturnType<typeof fakeFirestore>, overrides: Partial<RelayDeps> = {}) =>
    deps(db.firestore, { now: () => now, ...overrides })

  it('records who posted each comment, privately', async () => {
    const db = fakeFirestore()
    const { id } = await postComment(post(), at(db))
    expect(db.docs.get(`commentMeta/${id}`)!.fields).toEqual({
      networkKey: 'network',
      authUid: 'auth-uid',
      uid: 'extension-user',
      at: new Date(now),
      expireAt: new Date(now + 90 * DAY),
    })
  })

  it('refuses everything from a banned network, until the ban ends, whatever the IDs', async () => {
    const db = fakeFirestore({
      'networkBans/network': { uid: 'someone', expireAt: new Date(now + DAY) },
      'listingcomments/c1': { text: 'x', uid: 'poster', authorAuthUid: 'poster-auth' },
    })
    // A reinstall: new IDs, same connection
    const fresh = at(db, { verifyIdToken: async () => 'new-auth' })
    const body = { userId: 'new-uid' }
    await expect(postComment(post(body), fresh)).rejects.toThrow(/post comments right now/)
    await expect(toggleVote(send('/vote', { commentId: 'c1', ...body }), fresh)).rejects.toThrow(/vote right now/)
    await expect(
      reportComment(send('/report', { commentId: 'c1', reason: 'spam', details: '', ...body }), fresh),
    ).rejects.toThrow(/report comments right now/)
    await expect(editComment(send('/edit', { commentId: 'c1', text: 'Hello there', ...body }), fresh)).rejects.toThrow(
      /edit comments right now/,
    )
    // Once it's ended
    await postComment(post(body), at(db, { now: () => now + 2 * DAY, verifyIdToken: async () => 'new-auth' }))
  })

  it('refuses banned IDs on any network', async () => {
    const db = fakeFirestore({ 'bannedUsers/b1': { uid: 'banned-uid', authUids: ['banned-auth'] } })
    await expect(postComment(post({ userId: 'banned-uid' }), at(db))).rejects.toMatchObject({ status: 403 })
    await expect(
      postComment(post(), at(db, { verifyIdToken: async () => 'banned-auth', networkKey: 'other' })),
    ).rejects.toMatchObject({ status: 403 })
    await postComment(post(), at(db))
  })
})
