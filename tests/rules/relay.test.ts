// The comment relay's Firestore writes, against the emulator (`pnpm test:rules`): the REST encoding is right, and a
// comment the relay writes behaves under the security rules exactly like one the extension wrote itself.
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { RelayDeps } from '../../worker/src/relay'

import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createFirestore } from '../../worker/src/firestore'
import {
  deleteExpiredRecords,
  editComment,
  postComment,
  repeatKey,
  reportComment,
  toggleVote,
} from '../../worker/src/relay'

const PROJECT = 'demo-real-estate-comments'
let env: RulesTestEnvironment
// The emulator accepts "owner" as an admin token, like the relay's service account
const firestore = createFirestore({ project: PROJECT, baseUrl: 'http://127.0.0.1:8080', token: async () => 'owner' })

const property = {
  address: '46 Stanley Rd',
  suburb: 'Epping',
  state: 'nsw',
  postcode: '2121',
  url: 'https://www.domain.com.au/property-profile/46-stanley-road-epping-nsw-2121',
}

// Work the relay leaves running after its response (deleting expired rate limit records)
let background: Promise<unknown>[] = []
// Each post is a minute after the last, clear of the wait between posts
let clock = Date.now()

// A request to the relay from alice, on her home network
const send = <T>(
  action: (request: Request, deps: RelayDeps) => Promise<T>,
  body: Record<string, unknown>,
  as: Partial<RelayDeps> = {},
) =>
  action(
    new Request('https://relay.test/', {
      method: 'POST',
      headers: { authorization: 'Bearer id-token' },
      body: JSON.stringify({ userId: 'extension-user', ...body }),
    }),
    {
      firestore,
      verifyTurnstile: async () => true,
      verifyIdToken: async () => 'alice',
      networkKey: 'network',
      secret: 'secret',
      now: () => (clock += 60_000),
      afterResponse: task => void background.push(task),
      ...as,
    },
  )

const post = (body: Record<string, unknown> = {}) =>
  send(postComment, {
    property,
    text: 'Mould in the bathroom.',
    username: 'Jane',
    userId: 'extension-user',
    turnstileToken: 'token',
    ...body,
  })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await Promise.all(background)
  background = []
  clock = Date.now()
  await env.clearFirestore()
})

describe('comment relay', () => {
  it('writes a comment its author can read, edit and delete under the rules', async () => {
    const { id, createdAt } = await post()
    const alice = env.authenticatedContext('alice').firestore()
    const snap = await assertSucceeds(getDoc(doc(alice, `listingcomments/${id}`)))
    expect(snap.data()).toMatchObject({
      address: '46 stanley road',
      suburb: 'epping',
      text: 'Mould in the bathroom.',
      uid: 'extension-user',
      authorAuthUid: 'alice',
    })
    expect((snap.get('createdAt') as Timestamp).toMillis()).toBe(createdAt)

    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(deleteDoc(doc(bob, `listingcomments/${id}`)))
    await assertSucceeds(
      updateDoc(doc(alice, `listingcomments/${id}`), { text: 'Edited comment', editedAt: serverTimestamp() }),
    )
    await assertSucceeds(deleteDoc(doc(alice, `listingcomments/${id}`)))
  })

  it('writes replies the rules would accept', async () => {
    const top = await post()
    const reply = await post({ replyTo: top.id, text: 'Same here.' })
    expect(reply).toMatchObject({ parentId: top.id, replyToId: top.id })
    const second = await post({ replyTo: reply.id, text: 'Me too.' })
    expect(second).toMatchObject({ parentId: top.id, replyToId: reply.id })
  })

  it('deletes expired rate limit records, but not current ones', async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'rateLimits/expired'), { posts: [], expireAt: Timestamp.fromMillis(Date.now() - 1000) })
    })
    await post()
    await Promise.all(background)
    expect(await deleteExpiredRecords(firestore, Date.now())).toBe(0)
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      expect((await getDoc(doc(db, 'rateLimits/expired'))).exists()).toBe(false)
      expect((await getDoc(doc(db, 'rateLimits/network'))).exists()).toBe(true)
    })
  })

  it('keeps limit and repeat records private, and refuses repeats', async () => {
    await post()
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(alice, 'rateLimits/everyone')))
    await assertFails(getDoc(doc(alice, 'rateLimits/network')))
    const text = 'A comment long enough to be checked for repeats.'
    await post({ text })
    await assertFails(getDoc(doc(alice, `recentTexts/${await repeatKey(text, 'secret')}`)))
    await expect(post({ text })).rejects.toThrow(/already been posted/)
  })

  it('edits a comment so that it still votes and deletes under the rules', async () => {
    const { id } = await post()
    const edit = await send(editComment, { commentId: id, text: 'Mould in the bathroom, now fixed.' })
    const alice = env.authenticatedContext('alice').firestore()
    const snap = await getDoc(doc(alice, `listingcomments/${id}`))
    expect(snap.get('text')).toBe('Mould in the bathroom, now fixed.')
    expect((snap.get('editedAt') as Timestamp).toMillis()).toBe(edit.editedAt)
    expect(snap.get('authorAuthUid')).toBe('alice')
    const bob = env.authenticatedContext('bob').firestore()
    await assertSucceeds(updateDoc(doc(bob, `listingcomments/${id}`), { votes: 1, userVotes: { 'bob-uid': 'up' } }))
    await assertSucceeds(deleteDoc(doc(alice, `listingcomments/${id}`)))
  })

  it('stores reports exactly as the rules would accept them', async () => {
    const { id } = await post()
    await send(reportComment, { commentId: id, reason: 'spam', details: 'Advertising.' })
    await env.withSecurityRulesDisabled(async context => {
      const report = await getDoc(doc(context.firestore(), `reports/${id}_alice`))
      expect(Object.keys(report.data() ?? {}).sort()).toEqual([
        'commentId',
        'createdAt',
        'details',
        'reason',
        'reporterAuthUid',
      ])
      expect(report.data()).toMatchObject({ commentId: id, reason: 'spam', reporterAuthUid: 'alice' })
    })
    await expect(send(reportComment, { commentId: id, reason: 'spam', details: '' })).rejects.toThrow(/already/)
  })

  it('records votes on the comment the way the extension reads them', async () => {
    const { id } = await post()
    const bob = { verifyIdToken: async () => 'bob', networkKey: 'bobs-network' }
    const uid = '3488771f-e471-47a6-b12e-4bd0fa96e623'
    expect(await send(toggleVote, { commentId: id, userId: uid }, bob)).toEqual({ votes: 1, hasVoted: true })
    const read = async () => {
      let data: Record<string, unknown> = {}
      await env.withSecurityRulesDisabled(async context => {
        data = (await getDoc(doc(context.firestore(), `listingcomments/${id}`))).data() ?? {}
      })
      return data
    }
    expect(await read()).toMatchObject({ votes: 1, userVotes: { [uid]: 'up' } })
    // Another account on the same network can't add a vote
    await expect(
      send(toggleVote, { commentId: id, userId: 'other' }, { ...bob, verifyIdToken: async () => 'carol' }),
    ).rejects.toThrow(/already upvoted/)
    expect(await send(toggleVote, { commentId: id, userId: uid }, bob)).toEqual({ votes: 0, hasVoted: false })
    const after = await read()
    expect(after.votes).toBe(0)
    expect(after.userVotes).toEqual({})
  })

  it('keeps who posted a comment private, and checks bans against Firestore', async () => {
    const { id } = await post()
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(alice, `commentMeta/${id}`)))
    await assertFails(getDoc(doc(alice, 'networkBans/network')))
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      expect((await getDoc(doc(db, `commentMeta/${id}`))).data()).toMatchObject({
        networkKey: 'network',
        uid: 'extension-user',
      })
      await setDoc(doc(db, 'bannedUsers/b1'), { uid: 'someone-else', authUids: ['alice'] })
    })
    await expect(post({ text: 'Another comment' })).rejects.toThrow(/error 90001/)
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await deleteDoc(doc(db, 'bannedUsers/b1'))
      await setDoc(doc(db, 'networkBans/network'), { uid: 'x', expireAt: Timestamp.fromMillis(clock + 86_400_000) })
    })
    await expect(post({ text: 'Another comment' })).rejects.toThrow(/error 90001/)
  })
})
