import type { CommentView } from '../shared/messages'
import type { CommentSort } from '../shared/storage'

// A top-level comment and its replies. Replies are one level deep, like Discord: a reply to a reply goes in the same
// thread and shows what it answers (see replyContext).
export interface Thread {
  comment: CommentView
  replies: CommentView[]
}

// What a reply answers, shown above it: nothing when it answers its thread's first comment
export type ReplyContext = { id: string; username: string; excerpt: string } | { deleted: true } | null

const EXCERPT_LENGTH = 70

// Groups comments into threads. Top-level comments follow the chosen sort; replies are oldest first, as a
// conversation. A reply whose first comment has been deleted becomes a thread of its own.
export function buildThreads(comments: CommentView[], sort: CommentSort): Thread[] {
  const ids = new Set(comments.map(comment => comment.id))
  const replies = new Map<string, CommentView[]>()
  const top: CommentView[] = []
  for (const comment of comments) {
    if (comment.parentId && ids.has(comment.parentId)) {
      replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment])
    } else {
      top.push(comment)
    }
  }
  top.sort(
    sort === 'top' ? (a, b) => b.votes - a.votes || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt,
  )
  return top.map(comment => ({
    comment,
    replies: (replies.get(comment.id) ?? []).sort((a, b) => a.createdAt - b.createdAt),
  }))
}

export function replyContext(comment: CommentView, byId: Map<string, CommentView>): ReplyContext {
  if (!comment.parentId || !comment.replyToId) return null
  const target = byId.get(comment.replyToId)
  if (!target) return { deleted: true }
  // Answering the thread's first comment, which it's shown under anyway
  if (comment.replyToId === comment.parentId && byId.has(comment.parentId)) return null
  return { id: target.id, username: target.username, excerpt: excerpt(target.text) }
}

// The start of a comment as plain text: markdown symbols and links reduced to their words
export function excerpt(text: string): string {
  const plain = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : plain
}
