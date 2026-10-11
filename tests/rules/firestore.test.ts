// Tests firestore.rules against the Firestore emulator (`pnpm test:rules`, needs Java). The live rules are published
// by hand in the Firebase console, so run this before publishing a change.
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'

import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const MINUTE = 60_000

const comment = (overrides: Record<string, unknown> = {}) => ({
  address: '46 stanley road',
  suburb: 'epping',
  state: 'nsw',
  postcode: '2121',
  url: 'https://www.domain.com.au/46-stanley-road-epping-nsw-2121-1',
  text: 'A comment about the property',
  username: 'Anonymous',
  timestamp: new Date().toISOString(),
  createdAt: serverTimestamp(),
  uid: 'extension-user',
  ...overrides,
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-real-estate-comments',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    const at = (minutesAgo: number) => Timestamp.fromMillis(Date.now() - minutesAgo * MINUTE)
    await setDoc(doc(db, 'listingcomments/top'), comment({ authorAuthUid: 'alice', createdAt: at(1) }))
    await setDoc(doc(db, 'listingcomments/stale'), comment({ authorAuthUid: 'alice', createdAt: at(20) }))
    await setDoc(
      doc(db, 'listingcomments/legacy'),
      comment({ address: '97  yates ave', suburb: 'kew', createdAt: at(60) }),
    )
    await setDoc(
      doc(db, 'listingcomments/reply'),
      comment({ authorAuthUid: 'bob', parentId: 'top', replyToId: 'top', createdAt: at(1) }),
    )
  })
})

describe('creating comments', () => {
  it('accepts a comment from this version, and from older versions (no authorAuthUid)', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'listingcomments/new'), comment({ authorAuthUid: 'bob' })))
    await assertSucceeds(setDoc(doc(as('bob'), 'listingcomments/old-version'), comment()))
  })

  it('refuses unknown fields, someone else’s authorAuthUid, bad lengths and signed-out users', async () => {
    await assertFails(setDoc(doc(as('bob'), 'listingcomments/x'), comment({ extra: true })))
    await assertFails(setDoc(doc(as('bob'), 'listingcomments/x'), comment({ authorAuthUid: 'alice' })))
    await assertFails(setDoc(doc(as('bob'), 'listingcomments/x'), comment({ text: 'hey' })))
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'listingcomments/x'), comment()))
  })

  it('accepts a reply under a top-level comment on the same property, answering a reply', async () => {
    const reply = comment({ authorAuthUid: 'bob', parentId: 'top', replyToId: 'reply' })
    await assertSucceeds(setDoc(doc(as('bob'), 'listingcomments/r2'), reply))
  })

  it('accepts a reply under an old comment, using its address spelling', async () => {
    const reply = comment({ address: '97  yates ave', suburb: 'kew', parentId: 'legacy', replyToId: 'legacy' })
    await assertSucceeds(setDoc(doc(as('bob'), 'listingcomments/r3'), reply))
  })

  it('refuses replies under replies, to other properties, to missing comments, and half-filled fields', async () => {
    const db = as('bob')
    await assertFails(setDoc(doc(db, 'listingcomments/x'), comment({ parentId: 'reply', replyToId: 'reply' })))
    await assertFails(
      setDoc(doc(db, 'listingcomments/x'), comment({ address: '1 other street', parentId: 'top', replyToId: 'top' })),
    )
    await assertFails(setDoc(doc(db, 'listingcomments/x'), comment({ parentId: 'missing', replyToId: 'missing' })))
    await assertFails(setDoc(doc(db, 'listingcomments/x'), comment({ parentId: 'top' })))
    await assertFails(setDoc(doc(db, 'listingcomments/x'), comment({ replyToId: 'top' })))
  })
})

describe('updating comments', () => {
  it('accepts a vote', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'listingcomments/top'), { votes: 1, userVotes: { voter: 'up' } }))
  })

  it('lets the poster edit the text within 15 minutes', async () => {
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'listingcomments/top'), { text: 'An edited comment', editedAt: serverTimestamp() }),
    )
  })

  it('refuses edits by others, after 15 minutes, of other fields, or without editedAt = now', async () => {
    const edit = { text: 'An edited comment', editedAt: serverTimestamp() }
    await assertFails(updateDoc(doc(as('bob'), 'listingcomments/top'), edit))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/stale'), edit))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/legacy'), edit))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/top'), { ...edit, address: '1 other street' }))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/top'), { ...edit, editedAt: Timestamp.now() }))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/top'), { text: 'An edited comment' }))
    await assertFails(updateDoc(doc(as('alice'), 'listingcomments/top'), { ...edit, text: 'hey' }))
  })
})

describe('deleting comments', () => {
  it('lets only the poster delete, by Auth UID', async () => {
    await assertFails(deleteDoc(doc(as('bob'), 'listingcomments/top')))
    await assertFails(deleteDoc(doc(as('alice'), 'listingcomments/legacy')))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'listingcomments/top')))
  })
})

describe('reports', () => {
  const report = (commentId: string, reporter: string) => ({
    commentId,
    reason: 'spam',
    details: '',
    reporterAuthUid: reporter,
    createdAt: serverTimestamp(),
  })

  it('accepts one report per person per comment, and nobody can read them', async () => {
    const db = as('bob')
    await assertSucceeds(setDoc(doc(db, 'reports/top_bob'), report('top', 'bob')))
    await assertFails(setDoc(doc(db, 'reports/top_bob'), report('top', 'bob')))
    await assertFails(getDoc(doc(db, 'reports/top_bob')))
    await assertFails(getDocs(collection(db, 'reports')))
  })

  it('refuses reports with the wrong ID, reporter or reason, or for a missing comment', async () => {
    const db = as('bob')
    await assertFails(setDoc(doc(db, 'reports/top_carol'), report('top', 'bob')))
    await assertFails(setDoc(doc(db, 'reports/top_bob'), report('top', 'carol')))
    await assertFails(setDoc(doc(db, 'reports/top_bob'), { ...report('top', 'bob'), reason: 'nope' }))
    await assertFails(setDoc(doc(db, 'reports/missing_bob'), report('missing', 'bob')))
  })
})

describe('other collections', () => {
  it('lets signed-in users read comments and bans, and write neither bans nor legacy comments', async () => {
    const db = as('bob')
    await assertSucceeds(getDoc(doc(db, 'listingcomments/top')))
    await assertSucceeds(getDocs(collection(db, 'bannedUsers')))
    await assertFails(setDoc(doc(db, 'bannedUsers/x'), { uid: 'someone' }))
    await assertFails(setDoc(doc(db, 'comments/x'), { text: 'hello' }))
  })
})
