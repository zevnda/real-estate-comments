import type { CommentView, RecentCommentView } from '../../shared/messages'
import type { CommentSort } from '../../shared/storage'
import type { Loadable, useComments } from '../hooks'
import type { PageState } from '../page-state'

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { pluralize } from '../format'
import { useRecentComments, useStored } from '../hooks'
import { complaintsMailto, reportIssueUrl } from '../report'
import { buildThreads } from '../threads'
import { Comment, CommentThread, scrollToComment } from './Comment'
import { Composer } from './Composer'
import {
  CloseIcon,
  HeartIcon,
  HomeIcon,
  InfoIcon,
  MessageIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  SunIcon,
} from './icons'
import { PrivacyDialog, TermsDialog } from './Legal'
import { SearchTab } from './Search'
import { ErrorNotice, Notice, Skeleton } from './states'

const MIN_WIDTH = 340
const MAX_WIDTH = 760
// Until the user resizes it, the panel opens as wide as allowed (clampWidth caps it to the window)
const DEFAULT_WIDTH = MAX_WIDTH

type Tab = 'property' | 'recent' | 'search'

interface PanelProps {
  page: PageState
  comments: ReturnType<typeof useComments>
  dark: boolean
  onToggleTheme: () => void
  onClose: () => void
}

export function Panel({ page, comments, dark, onToggleTheme, onClose }: PanelProps) {
  const onPropertyPage = page.status !== 'browse'
  const [tab, setTab] = useState<Tab>(onPropertyPage ? 'property' : 'recent')
  const [sort, setSort] = useStored('sort', 'newest')
  const [width, setWidth] = useStored('panelWidth', DEFAULT_WIDTH)
  const recent = useRecentComments(tab === 'recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null)
  const [replyTo, setReplyTo] = useState<CommentView | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => setTab(onPropertyPage ? 'property' : 'recent'), [onPropertyPage])
  useEffect(() => panel.current?.focus(), [])

  const property = page.status === 'property' ? page.property : null
  // A reply belongs to the property it was started on
  useEffect(() => setReplyTo(null), [property?.input.url])
  const count = comments.state.status === 'ready' ? comments.state.data.length : null

  return (
    <div
      class='panel'
      ref={panel}
      tabIndex={-1}
      role='dialog'
      aria-label='Property comments'
      style={{ '--panel-width': `${clampWidth(width)}px` }}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <ResizeHandle width={clampWidth(width)} onResize={setWidth} />
      <header class='panel-header'>
        <div class='panel-heading'>
          <p class='eyebrow'>
            <MessageIcon size={14} />
            {property ? 'Property comments' : 'Real Estate Comments'}
          </p>
          <h2 class='panel-title'>{property ? property.displayAddress : headingFor(page)}</h2>
          <p class='panel-subtitle'>{property ? property.displayLocality : subheadingFor(page)}</p>
        </div>
        <div class='header-actions'>
          <button
            type='button'
            class='icon-button'
            onClick={onToggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type='button' class='icon-button' onClick={onClose} aria-label='Close comments' title='Close (Esc)'>
            <CloseIcon />
          </button>
        </div>
      </header>

      <nav class='tabs' role='tablist' aria-label='Comment views'>
        {onPropertyPage && (
          <button type='button' role='tab' aria-selected={tab === 'property'} onClick={() => setTab('property')}>
            This property{count !== null && <span class='tab-count'>{count}</span>}
          </button>
        )}
        <button type='button' role='tab' aria-selected={tab === 'recent'} onClick={() => setTab('recent')}>
          Recent submissions
        </button>
        <button type='button' role='tab' aria-selected={tab === 'search'} onClick={() => setTab('search')}>
          <SearchIcon size={14} />
          Search
        </button>
      </nav>

      <div class='panel-scroll' role='tabpanel'>
        {tab === 'property' ? (
          <PropertyTab
            page={page}
            comments={comments}
            sort={sort}
            onSort={setSort}
            onSearch={() => setTab('search')}
            onReply={setReplyTo}
          />
        ) : tab === 'recent' ? (
          <RecentTab
            state={recent.state}
            refreshing={recent.refreshing}
            onRefresh={recent.reload}
            showHint={!onPropertyPage}
          />
        ) : (
          <SearchTab query={searchQuery} onQuery={setSearchQuery} />
        )}
      </div>

      {tab === 'property' && property && (
        <div class='panel-composer'>
          <Composer
            property={property.input}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onPosted={comment => {
              comments.update(list => [comment, ...list])
              if (comment.parentId) {
                // Show the new reply in its thread
                setReplyTo(null)
                setTimeout(() => scrollToComment(panel.current?.getRootNode(), comment.id), 50)
              } else if (sort !== 'newest') {
                setSort('newest')
              }
            }}
          />
        </div>
      )}

      <footer class='panel-footer'>
        <a href='https://buymeacoffee.com/zevnda' target='_blank' rel='noopener noreferrer'>
          <HeartIcon />
          Support this extension
        </a>
        <div class='panel-footer-links'>
          <button type='button' onClick={() => setLegal('terms')}>
            Terms
          </button>
          <button type='button' onClick={() => setLegal('privacy')}>
            Privacy
          </button>
          <a href={complaintsMailto()}>Complaints</a>
          <a href={reportIssueUrl(page)} target='_blank' rel='noopener noreferrer'>
            Report a problem
          </a>
        </div>
      </footer>
      {legal === 'terms' && <TermsDialog onClose={() => setLegal(null)} />}
      {legal === 'privacy' && <PrivacyDialog onClose={() => setLegal(null)} />}
    </div>
  )
}

function PropertyTab({
  page,
  comments,
  sort,
  onSort,
  onSearch,
  onReply,
}: {
  page: PageState
  comments: ReturnType<typeof useComments>
  sort: CommentSort
  onSort: (sort: CommentSort) => void
  onSearch: () => void
  onReply: (comment: CommentView) => void
}) {
  const { threads, byId } = useMemo(() => {
    const list = comments.state.status === 'ready' ? comments.state.data : []
    return { threads: buildThreads(list, sort), byId: new Map(list.map(comment => [comment.id, comment])) }
  }, [comments.state, sort])

  if (page.status === 'resolving') return <Skeleton label='Finding this property’s address…' />
  if (page.status === 'unrecognised') {
    return (
      <Notice icon={<InfoIcon />} title='Couldn’t identify this property'>
        <p>
          The address couldn’t be read from this page. This happens when a listing has been taken off the market or
          hides its address.
        </p>
        <button type='button' class='button button--ghost' onClick={onSearch}>
          <SearchIcon />
          Search comments by address
        </button>
      </Notice>
    )
  }

  const { state } = comments
  if (state.status === 'idle' || state.status === 'loading') return <Skeleton label='Loading comments…' />
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={comments.reload} />
  const toolbar = (
    <div class='list-toolbar'>
      <span>{state.data.length ? pluralize(state.data.length, 'comment') : 'No comments yet'}</span>
      <div class='list-toolbar-actions'>
        <RefreshButton refreshing={comments.refreshing} onRefresh={comments.reload} />
        {state.data.length > 1 && (
          <div class='segmented' role='group' aria-label='Sort comments'>
            <button type='button' aria-pressed={sort === 'newest'} onClick={() => onSort('newest')}>
              Newest
            </button>
            <button type='button' aria-pressed={sort === 'top'} onClick={() => onSort('top')}>
              Top
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (state.data.length === 0) {
    return (
      <>
        {toolbar}
        <Notice icon={<HomeIcon />} title='Be the first to comment'>
          Lived here, inspected it, or know the area? Share what it’s really like.
        </Notice>
      </>
    )
  }

  const update = (changed: CommentView) => comments.update(list => list.map(c => (c.id === changed.id ? changed : c)))
  const remove = (id: string) => comments.update(list => list.filter(c => c.id !== id))
  return (
    <>
      {toolbar}
      <div class='comment-list'>
        {threads.map(thread => (
          <CommentThread
            key={thread.comment.id}
            thread={thread}
            byId={byId}
            onChange={update}
            onDelete={remove}
            onReply={onReply}
          />
        ))}
      </div>
    </>
  )
}

function RecentTab({
  state,
  refreshing,
  onRefresh,
  showHint,
}: {
  state: Loadable<RecentCommentView[]>
  refreshing: boolean
  onRefresh: () => void
  showHint: boolean
}) {
  return (
    <>
      {showHint && (
        <p class='hint-banner'>
          <InfoIcon />
          The latest comments on all properties. Open a listing to comment on it, or search by address.
        </p>
      )}
      {state.status === 'idle' || state.status === 'loading' ? (
        <Skeleton label='Loading recent comments…' />
      ) : state.status === 'error' ? (
        <ErrorNotice error={state.error} onRetry={onRefresh} />
      ) : (
        <>
          <div class='list-toolbar'>
            <span>Latest comments on all properties</span>
            <RefreshButton refreshing={refreshing} onRefresh={onRefresh} />
          </div>
          {state.data.length === 0 ? (
            <Notice icon={<MessageIcon />} title='No comments yet' />
          ) : (
            <div class='comment-list'>
              {state.data.map(comment => (
                <Comment key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

// Comments are cached for a few minutes (see background/cache.ts); this checks for new ones straight away
function RefreshButton({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  // After a click the button rests for COOLDOWN_MS (the background also answers refreshes within 30 s of the last
  // fetch from its cache), and spins for at least SPIN_MS so an instant answer still shows that something happened
  const [cooling, setCooling] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const refresh = () => {
    setCooling(true)
    setSpinning(true)
    timers.current.push(
      window.setTimeout(() => setCooling(false), COOLDOWN_MS),
      window.setTimeout(() => setSpinning(false), SPIN_MS),
    )
    onRefresh()
  }

  return (
    <button
      type='button'
      class={`icon-button icon-button--small${refreshing || spinning ? ' icon-button--spinning' : ''}`}
      onClick={refresh}
      disabled={refreshing || cooling}
      aria-label='Check for new comments'
      title='Check for new comments'
    >
      <RefreshIcon />
    </button>
  )
}

const COOLDOWN_MS = 2000
const SPIN_MS = 600

// Drag the panel's left edge to resize it. The width is remembered across pages.
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  return (
    <div
      class={`resize-handle${dragWidth !== null ? ' resize-handle--active' : ''}`}
      aria-hidden='true'
      onPointerDown={event => {
        event.preventDefault()
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)
        const startX = event.clientX
        let latest = width
        const move = (e: PointerEvent) => {
          latest = clampWidth(width + startX - e.clientX)
          setDragWidth(latest)
          handle.closest<HTMLElement>('.panel')?.style.setProperty('--panel-width', `${latest}px`)
        }
        const up = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
          handle.removeEventListener('pointercancel', up)
          setDragWidth(null)
          onResize(latest)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
        handle.addEventListener('pointercancel', up)
      }}
    />
  )
}

function clampWidth(width: number): number {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH, window.innerWidth - 32))
}

function headingFor(page: PageState): string {
  if (page.status === 'resolving') return 'Loading…'
  if (page.status === 'unrecognised') return 'Unknown address'
  return 'Property comments'
}

function subheadingFor(page: PageState): string {
  if (page.status === 'browse') return 'Open a listing, or search by address, to see what people say about a property.'
  return ''
}
