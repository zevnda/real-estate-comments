import type { CommentView, RecentCommentView } from '../../shared/messages'

import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { avatarHue, formatAbsolute, formatRelative, initials } from '../format'
import { errorMessage } from '../hooks'
import { commentImages, renderMarkdown } from '../markdown'
import { reportCommentUrl } from '../report'
import { FlagIcon, TrashIcon, UpvoteIcon } from './icons'
import { CommentImages } from './Images'
import { PropertyLinks } from './PropertyLinks'

export function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.replaceChildren(renderMarkdown(text))
  }, [text])
  return <div class='markdown' ref={ref} />
}

interface CommentProps {
  comment: CommentView | RecentCommentView
  onChange?: (comment: CommentView) => void
  onDelete?: (id: string) => void
}

export function Comment({ comment, onChange, onDelete }: CommentProps) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recent = 'displayAddress' in comment ? comment : null
  const images = useMemo(() => commentImages(comment.text), [comment.text])

  const vote = async () => {
    if (busy || !onChange) return
    setBusy(true)
    setError(null)
    // Update straight away, then settle on what the server says
    const optimistic = !comment.hasVoted
    onChange({ ...comment, hasVoted: optimistic, votes: Math.max(0, comment.votes + (optimistic ? 1 : -1)) })
    try {
      const result = await callBackground('toggleVote', { commentId: comment.id })
      onChange({ ...comment, ...result })
    } catch (err) {
      onChange(comment)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await callBackground('deleteComment', { commentId: comment.id })
      onDelete?.(comment.id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <article class={`comment${comment.isOwn ? ' comment--own' : ''}`}>
      <div class='avatar' style={{ '--hue': avatarHue(comment.username) }} aria-hidden='true'>
        {initials(comment.username)}
      </div>
      <div class='comment-main'>
        {recent && (
          <div class='comment-property'>
            <span class='comment-property-address'>
              {recent.displayAddress}, {recent.displayLocality}
            </span>
            {recent.links && <PropertyLinks links={recent.links} />}
          </div>
        )}
        <header class='comment-meta'>
          <span class='comment-author'>{comment.username}</span>
          {comment.isOwn && <span class='chip chip--accent'>You</span>}
          <span class='dot' aria-hidden='true'>
            ·
          </span>
          <time dateTime={new Date(comment.createdAt).toISOString()} title={formatAbsolute(comment.createdAt)}>
            {formatRelative(comment.createdAt)}
          </time>
        </header>
        <Markdown text={comment.text} />
        {images.length > 0 && <CommentImages images={images} />}
        <footer class='comment-actions'>
          {onChange && !comment.isOwn ? (
            <button
              type='button'
              class={`vote${comment.hasVoted ? ' vote--active' : ''}`}
              aria-pressed={comment.hasVoted}
              aria-label={comment.hasVoted ? 'Remove your upvote' : 'Upvote this comment'}
              title={comment.hasVoted ? 'Remove your upvote' : 'Helpful? Upvote it'}
              onClick={vote}
            >
              <UpvoteIcon />
              <span>{comment.votes}</span>
            </button>
          ) : (
            <span class='vote vote--static' title='Upvotes'>
              <UpvoteIcon />
              <span>{comment.votes}</span>
            </span>
          )}
          {!comment.isOwn && (
            <a
              class='text-button'
              href={reportCommentUrl(comment)}
              target='_blank'
              rel='noopener noreferrer'
              title='Report this comment'
            >
              <FlagIcon />
              Report
            </a>
          )}
          {comment.canDelete && onDelete && !confirming && (
            <button type='button' class='text-button' onClick={() => setConfirming(true)} disabled={busy}>
              <TrashIcon />
              Delete
            </button>
          )}
          {confirming && (
            <span class='confirm' role='group' aria-label='Confirm delete'>
              Delete this comment?
              <button type='button' class='text-button text-button--danger' onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button type='button' class='text-button' onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
            </span>
          )}
        </footer>
        {error && (
          <p class='inline-error' role='alert'>
            {error}
          </p>
        )}
      </div>
    </article>
  )
}
