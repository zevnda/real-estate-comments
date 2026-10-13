import type { CommentView } from '../src/shared/messages'

import { describe, expect, it } from 'vitest'

import { buildThreads, excerpt, replyContext } from '../src/content/threads'

const comment = (id: string, createdAt: number, extra: Partial<CommentView> = {}): CommentView => ({
  id,
  text: `Comment ${id}`,
  username: `User ${id}`,
  createdAt,
  votes: 0,
  hasVoted: false,
  isOwn: false,
  canDelete: false,
  ...extra,
})

describe('buildThreads', () => {
  const a = comment('a', 100, { votes: 1 })
  const b = comment('b', 200)
  const r1 = comment('r1', 300, { parentId: 'a', replyToId: 'a' })
  const r2 = comment('r2', 250, { parentId: 'a', replyToId: 'r1' })

  it('puts replies under their comment, oldest first, and sorts top-level comments', () => {
    const threads = buildThreads([r1, b, a, r2], 'newest')
    expect(threads.map(thread => thread.comment.id)).toEqual(['b', 'a'])
    expect(threads[1]!.replies.map(reply => reply.id)).toEqual(['r2', 'r1'])
    expect(buildThreads([r1, b, a, r2], 'top').map(thread => thread.comment.id)).toEqual(['a', 'b'])
  })

  it('shows a reply whose first comment was deleted as a thread of its own', () => {
    expect(buildThreads([b, r1], 'newest').map(thread => thread.comment.id)).toEqual(['r1', 'b'])
  })
})

describe('replyContext', () => {
  const a = comment('a', 100)
  const r1 = comment('r1', 200, { parentId: 'a', replyToId: 'a' })
  const r2 = comment('r2', 300, { parentId: 'a', replyToId: 'r1' })
  const byId = new Map([a, r1, r2].map(c => [c.id, c]))

  it('is empty for top-level comments and replies to the thread’s first comment', () => {
    expect(replyContext(a, byId)).toBeNull()
    expect(replyContext(r1, byId)).toBeNull()
  })

  it('names the reply being answered', () => {
    expect(replyContext(r2, byId)).toEqual({ id: 'r1', username: 'User r1', excerpt: 'Comment r1' })
  })

  it('says when the comment being answered was deleted', () => {
    expect(replyContext(r2, new Map([a, r2].map(c => [c.id, c])))).toEqual({ deleted: true })
    expect(replyContext(r1, new Map([[r1.id, r1]]))).toEqual({ deleted: true })
  })
})

describe('excerpt', () => {
  it('strips markdown and shortens long text', () => {
    expect(excerpt('**Mould** in the [bathroom](https://x.com)\n\n> quoted')).toBe('Mould in the bathroom quoted')
    expect(excerpt('word '.repeat(40))).toMatch(/^word( word)*…$/)
    expect(excerpt('word '.repeat(40)).length).toBeLessThanOrEqual(70)
  })
})
