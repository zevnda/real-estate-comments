import type { Draft } from '../content/ui/Composer'
import type { CommentsView } from '../content/views'
import type { CommentView } from '../shared/messages'
import type { PageProperty } from '../shared/property'

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { useComments, useStored } from '../content/hooks'
import { complaintsMailto } from '../content/report'
import { CommentThread, scrollToComment } from '../content/ui/Comment'
import { Composer, EMPTY_DRAFT } from '../content/ui/Composer'
import { PrivacyDialog, TermsDialog } from '../content/ui/Legal'
import { ErrorNotice, NoImages, Skeleton } from '../content/ui/states'
import { ViewSelect } from '../content/ui/ViewSelect'
import { COMMENT_VIEWS, viewThreads } from '../content/views'

// Where "Powered by Real Estate Comments" leads: the extension's listing for the viewer's browser (the Chrome Web
// Store suits Edge and the other Chromium browsers too)
const STORE_URLS = {
  chrome: 'https://chromewebstore.google.com/detail/fpmhogbiebniapjfkbhgeacgkgpjaenn',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/real-estate-comments/',
}

// The embed's comment section: a card in the partner page's main column, built from the extension's comment UI.
// Every comment is in a list that scrolls past a fixed height (embed.css), so the card, and the iframe, stay about
// the same size however many there are, and dialogs open over it like the extension's.
export function App({ property }: { property: PageProperty }) {
  const comments = useComments(property.input)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [sort, setSort] = useStored('sort', 'newest')
  const [imagesOnly, setImagesOnly] = useState(false)
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null)
  // The comment box starts as one line, and opens when the viewer starts writing or replying
  const [composing, setComposing] = useState(false)
  const composerBox = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)
  const view: CommentsView = imagesOnly ? 'images' : sort
  const open = composing || !!draft.text || !!draft.replyTo
  const count = comments.state.status === 'ready' ? comments.state.data.length : null

  const onDraft = (change: Partial<Draft>) => setDraft(current => ({ ...current, ...change }))
  const onView = (next: CommentsView) => {
    setImagesOnly(next === 'images')
    if (next !== 'images') setSort(next)
  }

  // Opening the box (or choosing Reply) takes the viewer to it. scrollIntoView can move the partner's page too,
  // since it follows a click.
  useEffect(() => {
    if (!composing) return
    composerBox.current?.querySelector('textarea')?.focus({ preventScroll: true })
    composerBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [composing, draft.replyTo?.id])

  return (
    <section class='embed' ref={root} aria-labelledby='rec-embed-title'>
      <header class='embed-header'>
        <h2 id='rec-embed-title' class='embed-title'>
          Comments
          {count !== null && count > 0 && <span class='embed-count'> · {count}</span>}
        </h2>
        {count !== null && count > 1 && (
          <ViewSelect label='Sort or filter comments' value={view} options={COMMENT_VIEWS} onChange={onView} />
        )}
      </header>

      <div class='embed-list'>
        <CommentList
          comments={comments}
          view={view}
          onView={onView}
          replyingTo={draft.replyTo?.id ?? null}
          onReply={comment => {
            onDraft({ replyTo: comment })
            setComposing(true)
          }}
        />
      </div>

      <div class='embed-composer' ref={composerBox}>
        {open ? (
          <Composer
            property={property.input}
            draft={draft}
            onDraft={onDraft}
            onPosted={comment => {
              comments.update(list => [comment, ...list])
              setComposing(false)
              if (comment.parentId) {
                // Show the new reply in its thread
                onDraft({ replyTo: null })
                setTimeout(() => scrollToComment(root.current?.getRootNode(), comment.id), 50)
              } else if (sort !== 'newest' || imagesOnly) {
                // Show the new comment at the top
                setSort('newest')
                setImagesOnly(false)
              }
            }}
          />
        ) : (
          <button type='button' class='embed-prompt' onClick={() => setComposing(true)}>
            <span class='embed-prompt-text'>
              {count ? 'Lived here or inspected it? Add a comment…' : 'Lived here or inspected it? Be the first…'}
            </span>
            <span class='embed-prompt-post' aria-hidden='true'>
              Post
            </span>
          </button>
        )}
      </div>

      <footer class='embed-footer'>
        <a
          href={navigator.userAgent.includes('Firefox/') ? STORE_URLS.firefox : STORE_URLS.chrome}
          target='_blank'
          rel='noopener noreferrer'
        >
          Powered by Real Estate Comments
        </a>
        <span aria-hidden='true'>·</span>
        <button type='button' onClick={() => setLegal('terms')}>
          Terms
        </button>
        <span aria-hidden='true'>·</span>
        <button type='button' onClick={() => setLegal('privacy')}>
          Privacy
        </button>
        <span aria-hidden='true'>·</span>
        <a href={complaintsMailto()}>Complaints</a>
      </footer>
      {legal === 'terms' && <TermsDialog onClose={() => setLegal(null)} />}
      {legal === 'privacy' && <PrivacyDialog onClose={() => setLegal(null)} />}
    </section>
  )
}

function CommentList({
  comments,
  view,
  onView,
  replyingTo,
  onReply,
}: {
  comments: ReturnType<typeof useComments>
  view: CommentsView
  onView: (view: CommentsView) => void
  replyingTo: string | null
  onReply: (comment: CommentView) => void
}) {
  const { threads, byId } = useMemo(() => {
    const list = comments.state.status === 'ready' ? comments.state.data : []
    return { threads: viewThreads(list, view), byId: new Map(list.map(comment => [comment.id, comment])) }
  }, [comments.state, view])

  const { state } = comments
  if (state.status === 'idle' || state.status === 'loading') return <Skeleton label='Loading comments…' />
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={comments.reload} />
  if (state.data.length === 0) {
    return <p class='embed-empty'>No comments yet. Know this place? Share what it’s really like.</p>
  }
  if (!threads.length) return <NoImages onShowAll={() => onView('newest')} />

  const update = (changed: CommentView) => comments.update(list => list.map(c => (c.id === changed.id ? changed : c)))
  const remove = (id: string) => comments.update(list => list.filter(c => c.id !== id))
  return (
    <div class='comment-list'>
      {threads.map(thread => (
        <CommentThread
          key={thread.comment.id}
          thread={thread}
          byId={byId}
          onChange={update}
          onDelete={remove}
          onReply={onReply}
          replyingTo={replyingTo}
        />
      ))}
    </div>
  )
}
