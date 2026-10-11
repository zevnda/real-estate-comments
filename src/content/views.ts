import type { CommentView } from '../shared/messages'
import type { CommentSort } from '../shared/storage'
import type { Thread } from './threads'

import { commentImages } from './markdown'
import { buildThreads } from './threads'

// How a list of comments is shown: a sort, or only the threads with photos (newest first)
export type CommentsView = CommentSort | 'photos'

export const COMMENT_VIEWS: { value: CommentsView; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'top', label: 'Top' },
  { value: 'photos', label: 'With photos' },
]

// A thread counts as having photos if its comment or any reply links an image that's shown as a thumbnail
export function hasPhotos(comment: CommentView): boolean {
  return commentImages(comment.text).length > 0
}

export function viewThreads(comments: CommentView[], view: CommentsView): Thread[] {
  const threads = buildThreads(comments, view === 'top' ? 'top' : 'newest')
  return view === 'photos'
    ? threads.filter(thread => hasPhotos(thread.comment) || thread.replies.some(hasPhotos))
    : threads
}

// Search results: properties with comments
export type ResultsView = 'match' | 'newest' | 'comments' | 'photos'

export const RESULT_VIEWS: { value: ResultsView; label: string }[] = [
  { value: 'match', label: 'Best match' },
  { value: 'newest', label: 'Newest' },
  { value: 'comments', label: 'Most comments' },
  { value: 'photos', label: 'With photos' },
]

// Results arrive best match first; the other views re-sort or filter them
export function viewResults<T extends { comments: CommentView[]; latestAt: number }>(
  results: T[],
  view: ResultsView,
): T[] {
  if (view === 'newest') return [...results].sort((a, b) => b.latestAt - a.latestAt)
  if (view === 'comments') return [...results].sort((a, b) => b.comments.length - a.comments.length)
  if (view === 'photos') return results.filter(result => result.comments.some(hasPhotos))
  return results
}
