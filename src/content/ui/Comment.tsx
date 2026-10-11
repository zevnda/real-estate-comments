import type { ComponentChildren } from 'preact'
import type { CommentView, RecentCommentView } from '../../shared/messages'
import type { ReplyContext, Thread } from '../threads'

import { createPortal } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { validateCommentText } from '../../shared/validation'
import { avatarHue, formatAbsolute, formatRelative, initials } from '../format'
import { errorMessage } from '../hooks'
import { commentImages } from '../markdown'
import { replyContext } from '../threads'
import { FlagIcon, PencilIcon, ReplyIcon, TrashIcon, UpvoteIcon } from './icons'
import { CommentImages } from './Images'
import { PostingRulesDialog, usePostingRules } from './Legal'
import { Markdown } from './Markdown'
import { MarkdownEditor } from './MarkdownEditor'
import { PropertyLinks } from './PropertyLinks'
import { ReportDialog } from './ReportDialog'

interface CommentProps {
  comment: CommentView | RecentCommentView
  onChange?: (comment: CommentView) => void
  onDelete?: (id: string) => void
  // Only where the user can post (the property tab)
  onReply?: (comment: CommentView) => void
  // Inside a thread: what this reply answers (see replyContext), and whether it's shown as a reply
  context?: ReplyContext
  nested?: boolean
}

// A top-level comment with its replies underneath
export function CommentThread({
  thread,
  byId,
  ...actions
}: {
  thread: Thread
  byId: Map<string, CommentView>
} & Pick<CommentProps, 'onChange' | 'onDelete' | 'onReply'>) {
  return (
    <div class='thread'>
      <Comment comment={thread.comment} context={replyContext(thread.comment, byId)} {...actions} />
      {thread.replies.length > 0 && (
        <div class='replies'>
          {thread.replies.map(reply => (
            <Comment key={reply.id} comment={reply} context={replyContext(reply, byId)} nested {...actions} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Comment({ comment, onChange, onDelete, onReply, context, nested }: CommentProps) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [editing, setEditing] = useState(false)
  const article = useRef<HTMLElement>(null)
  const recent = 'displayAddress' in comment ? comment : null
  const images = useMemo(() => commentImages(comment.text), [comment.text])
  const canEdit = useEditable(comment.editableUntil) && !!onChange

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
    <article ref={article} id={commentElementId(comment.id)} class={`comment${nested ? ' comment--reply' : ''}`}>
      <div class='avatar' style={{ '--hue': avatarHue(comment.username) }} aria-hidden='true'>
        {initials(comment.username)}
      </div>
      <div class='comment-main'>
        {recent && (
          <div class='comment-property'>
            <span class='comment-property-address'>
              {recent.displayAddress}, {recent.displayLocality}
            </span>
          </div>
        )}
        {context && <ReplyTo context={context} />}
        <header class='comment-meta'>
          <span class='comment-author'>{comment.username}</span>
          {comment.isOwn && <span class='chip chip--accent'>You</span>}
          {/* Outside threads (Recent), say it's a reply, since what it answers isn't shown */}
          {comment.parentId && context === undefined && <span class='chip'>Reply</span>}
          <span class='dot' aria-hidden='true'>
            ·
          </span>
          <time dateTime={new Date(comment.createdAt).toISOString()} title={formatAbsolute(comment.createdAt)}>
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span class='comment-edited' title={`Edited ${formatAbsolute(comment.editedAt)}`}>
              (edited)
            </span>
          )}
        </header>
        {editing && onChange ? (
          <EditForm
            comment={comment}
            onCancel={() => setEditing(false)}
            onSaved={changes => {
              onChange({ ...comment, ...changes })
              setEditing(false)
            }}
          />
        ) : (
          <>
            <Markdown text={comment.text} />
            {images.length > 0 && <CommentImages images={images} />}
          </>
        )}
        {!editing && (
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
            {onReply && (
              <button type='button' class='text-button' onClick={() => onReply(comment)}>
                <ReplyIcon />
                Reply
              </button>
            )}
            {canEdit && (
              <button
                type='button'
                class='text-button'
                onClick={() => setEditing(true)}
                title='Comments can be edited for 15 minutes after posting'
              >
                <PencilIcon />
                Edit
              </button>
            )}
            {!comment.isOwn &&
              (reported ? (
                <span class='text-button text-button--static'>
                  <FlagIcon />
                  Reported
                </span>
              ) : (
                <button
                  type='button'
                  class='text-button'
                  onClick={() => setReporting(true)}
                  title='Report this comment'
                >
                  <FlagIcon />
                  Report
                </button>
              ))}
            {/* Recent: the property's pages, with the comment's other actions */}
            {recent?.links && <PropertyLinks links={recent.links} />}
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
        )}
        {error && (
          <p class='inline-error' role='alert'>
            {error}
          </p>
        )}
      </div>
      {reporting && (
        <PanelPortal from={article.current}>
          <ReportDialog
            commentId={comment.id}
            onClose={() => setReporting(false)}
            onReported={() => setReported(true)}
          />
        </PanelPortal>
      )}
    </article>
  )
}

// "↪ Sam: the start of their comment", above a reply that answers another reply. Clicking it shows that reply.
function ReplyTo({ context }: { context: NonNullable<ReplyContext> }) {
  if ('deleted' in context) return <p class='reply-to reply-to--deleted'>Replying to a deleted comment</p>
  return (
    <button
      type='button'
      class='reply-to'
      // The shadow root is found from the click itself: a ref read during render is still empty on a comment's first
      // render (e.g. after switching tabs), which left the link doing nothing
      onClick={event => scrollToComment(event.currentTarget.getRootNode(), context.id)}
      title='Show the comment this replies to'
    >
      <ReplyIcon />
      <span class='reply-to-name'>{context.username}</span>
      <span class='reply-to-excerpt'>{context.excerpt}</span>
    </button>
  )
}

// Inline editing, within the edit window. Saving shows the posting rules first, like posting.
function EditForm({
  comment,
  onCancel,
  onSaved,
}: {
  comment: CommentView
  onCancel: () => void
  onSaved: (changes: { text: string; editedAt: number }) => void
}) {
  const [text, setText] = useState(comment.text)
  const [saving, setSaving] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const rules = usePostingRules()
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const invalid = validateCommentText(text)
  const fieldId = `rec-edit-${comment.id}`

  useEffect(() => {
    const element = textarea.current
    element?.focus()
    element?.setSelectionRange(element.value.length, element.value.length)
  }, [])

  const save = () => {
    setTouched(true)
    if (invalid || saving) return
    if (text.trim() === comment.text.trim()) return onCancel()
    if (rules.needed) setShowRules(true)
    else void submit()
  }

  const submit = async () => {
    setShowRules(false)
    setSaving(true)
    setError(null)
    try {
      onSaved(await callBackground('editComment', { commentId: comment.id, text }))
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <form
      ref={form}
      class='edit-form'
      onSubmit={event => {
        event.preventDefault()
        save()
      }}
    >
      <MarkdownEditor
        id={fieldId}
        label='Edit your comment'
        value={text}
        onInput={setText}
        textareaRef={textarea}
        invalid={touched && !!invalid}
        describedBy={`${fieldId}-hint`}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            save()
          } else if (event.key === 'Escape') {
            // Cancel the edit, not close the panel
            event.stopPropagation()
            onCancel()
          }
        }}
      />
      <div class='composer-row'>
        <p id={`${fieldId}-hint`} class='composer-hint'>
          {touched && invalid ? <span class='inline-error'>{invalid}</span> : 'Ctrl+Enter to save · Esc to cancel'}
        </p>
        <button type='button' class='button button--ghost' onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type='submit' class='button button--primary' disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && (
        <p class='inline-error' role='alert'>
          {error}
        </p>
      )}
      {showRules && (
        <PanelPortal from={form.current}>
          <PostingRulesDialog
            agreeLabel='I agree, save changes'
            onCancel={() => setShowRules(false)}
            onAgree={() => {
              rules.accept()
              void submit()
            }}
          />
        </PanelPortal>
      )}
    </form>
  )
}

// Whether the edit window is still open, re-rendering when it closes so the Edit button goes away
function useEditable(until: number | undefined): boolean {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!until || until <= now) return
    const timer = setTimeout(() => setNow(Date.now()), until - now + 100)
    return () => clearTimeout(timer)
  }, [until, now])
  return !!until && now < until
}

// Dialogs belong inside .panel (see Dialog), not inside the scrolling list a comment is in
function PanelPortal({ from, children }: { from: HTMLElement | null; children: ComponentChildren }) {
  const panel = from?.closest('.panel')
  return panel ? createPortal(children, panel) : null
}

const commentElementId = (id: string) => `rec-comment-${id}`

// Scrolls a comment into view and briefly highlights it (after following a "replying to" link, or posting a reply)
export function scrollToComment(root: Node | undefined, id: string) {
  if (!(root instanceof ShadowRoot)) return
  const element = root.getElementById(commentElementId(id))
  if (!element) return
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element.classList.remove('comment--flash')
  // Restart the animation if it's already highlighted
  void element.offsetWidth
  element.classList.add('comment--flash')
  setTimeout(() => element.classList.remove('comment--flash'), 1600)
}
