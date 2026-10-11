import type { CommentView } from '../../shared/messages'
import type { CommentsView } from '../views'

import { useMemo, useState } from 'preact/hooks'

import { pluralize } from '../format'
import { COMMENT_VIEWS, viewThreads } from '../views'
import { CommentThread } from './Comment'
import { NoPhotos } from './states'
import { ViewSelect } from './ViewSelect'

// A property's comments opened from Search or the Watchlist: with the same sort and filter as the property tab, but
// no replying (posting needs the property's own page)
export function DetailComments({
  comments,
  onUpdate,
}: {
  comments: CommentView[]
  onUpdate: (change: (comments: CommentView[]) => CommentView[]) => void
}) {
  const [view, setView] = useState<CommentsView>('newest')
  const { threads, byId } = useMemo(
    () => ({ threads: viewThreads(comments, view), byId: new Map(comments.map(c => [c.id, c])) }),
    [comments, view],
  )
  return (
    <>
      <div class='list-toolbar'>
        <span>{pluralize(comments.length, 'comment')}</span>
        <ViewSelect label='Sort or filter comments' value={view} options={COMMENT_VIEWS} onChange={setView} />
      </div>
      {threads.length ? (
        <div class='comment-list'>
          {threads.map(thread => (
            <CommentThread
              key={thread.comment.id}
              thread={thread}
              byId={byId}
              onChange={changed => onUpdate(list => list.map(c => (c.id === changed.id ? changed : c)))}
              onDelete={id => onUpdate(list => list.filter(c => c.id !== id))}
            />
          ))}
        </div>
      ) : (
        <NoPhotos onShowAll={() => setView('newest')} />
      )}
    </>
  )
}
