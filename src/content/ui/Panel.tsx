import type { ComponentChildren } from 'preact'
import type { CommentView } from '../../shared/messages'
import type { AppNotification } from '../../shared/notifications'
import type { useComments } from '../hooks'
import type { PageState } from '../page-state'
import type { CommentsView } from '../views'
import type { Draft } from './Composer'

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { ext } from '../../shared/ext'
import { MAX_RECENT } from '../../shared/messages'
import { titleCase } from '../../shared/property'
import { newComments, watchKey } from '../../shared/watchlist'
import { pluralize } from '../format'
import {
  useAreaStats,
  useNotifications,
  useRecentComments,
  useStored,
  useWatchedComments,
  useWatchlist,
} from '../hooks'
import { complaintsMailto, reportIssueUrl } from '../report'
import { COMMENT_VIEWS, viewThreads } from '../views'
import { AreaCard } from './AreaCard'
import { Comment, CommentThread, scrollToComment } from './Comment'
import { Composer } from './Composer'
import {
  BellIcon,
  ClockIcon,
  CloseIcon,
  HeartIcon,
  HomeIcon,
  InfoIcon,
  MessageIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
} from './icons'
import { PrivacyDialog, TermsDialog } from './Legal'
import { NotificationDetail, NotificationsMenu } from './Notifications'
import { ReviewDialog, useReviewPrompt } from './ReviewPrompt'
import { SearchTab } from './Search'
import { ErrorNotice, NoImages, Notice, Skeleton } from './states'
import { ViewSelect } from './ViewSelect'
import { WatchButton, watchEntry, WatchlistContext, WatchlistTab } from './Watchlist'
import { CHANGES, WhatsNewDialog } from './WhatsNew'

const MIN_WIDTH = 340
const MAX_WIDTH = 760
// Until the user resizes it, the panel opens as wide as allowed (clampWidth caps it to the window)
const DEFAULT_WIDTH = MAX_WIDTH

type Tab = 'property' | 'recent' | 'watchlist' | 'search'

// Shown in the header's eyebrow line for the selected tab
const TAB_HEADINGS: Record<Tab, string> = {
  property: 'Property comments',
  recent: 'Recent comments',
  watchlist: 'Watchlist',
  search: 'Search',
}

function TabIcon({ tab, size = 16 }: { tab: Tab; size?: number }) {
  if (tab === 'property') return <HomeIcon size={size} />
  if (tab === 'recent') return <ClockIcon size={size} />
  if (tab === 'watchlist') return <StarIcon size={size} />
  return <SearchIcon size={size} />
}

interface PanelProps {
  page: PageState
  comments: ReturnType<typeof useComments>
  dark: boolean
  onToggleTheme: () => void
  onClose: () => void
  draft: Draft
  onDraft: (change: Partial<Draft>) => void
}

export function Panel({ page, comments, dark, onToggleTheme, onClose, draft, onDraft }: PanelProps) {
  const onPropertyPage = page.status !== 'browse'
  const [tab, setTab] = useState<Tab>(onPropertyPage ? 'property' : 'recent')
  const [sort, setSort] = useStored('sort', 'newest')
  const [width, setWidth] = useStored('panelWidth', DEFAULT_WIDTH)
  const recent = useRecentComments(tab === 'recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null)
  const [imagesOnly, setImagesOnly] = useState(false)
  const watchlist = useWatchlist()
  // Checked whenever the panel is open, for the tab's "new" count (cheap: the background caches each lookup)
  const watched = useWatchedComments(watchlist.items, true)
  const notifications = useNotifications(watchlist, watched)
  const [showNotifications, setShowNotifications] = useState(false)
  // A notification's property, shown in place of the selected tab until a tab is chosen
  const [notice, setNotice] = useState<AppNotification | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  // Set by the background after an update: show what's new the first time the panel opens
  const [whatsNewFor, saveWhatsNewFor, whatsNewLoaded] = useStored('whatsNewFor', '')
  useEffect(() => {
    if (whatsNewLoaded && whatsNewFor && whatsNewFor === ext.runtime.getManifest().version && CHANGES) {
      setShowWhatsNew(true)
    }
  }, [whatsNewLoaded, whatsNewFor])
  // Never on top of What's new, or the legal pages
  const review = useReviewPrompt(showWhatsNew || legal !== null)
  const area = page.status === 'browse' ? page.area : undefined
  const areaStats = useAreaStats(area)

  useEffect(() => setTab(onPropertyPage ? 'property' : 'recent'), [onPropertyPage])
  useEffect(() => panel.current?.focus(), [])

  const property = page.status === 'property' ? page.property : null
  const count = comments.state.status === 'ready' ? comments.state.data.length : null
  const newestAt =
    comments.state.status === 'ready' ? Math.max(0, ...comments.state.data.map(comment => comment.createdAt)) : 0
  const entry = property ? watchEntry(property.input, property.displayAddress, property.displayLocality) : null

  // Seeing a watched property's comments on its own page counts as having seen them
  const watchedHere = !!entry && watchlist.isWatched(entry.key)
  useEffect(() => {
    if (entry && watchedHere && tab === 'property' && newestAt) watchlist.markSeen(entry.key, newestAt)
  }, [entry?.key, watchedHere, tab, newestAt])

  const newOnWatchlist = watchlist.items.reduce((total, item) => {
    const state = watched.byKey[item.key]
    return total + (state?.status === 'ready' ? newComments(state.data, item.seenAt) : 0)
  }, 0)

  const heading = notice
    ? { title: notice.property.displayAddress, subtitle: notice.property.displayLocality }
    : headerFor(tab, page, { count: watchlist.items.length, fresh: newOnWatchlist })

  const openNotification = (notification: AppNotification) => {
    notifications.markRead(notification.id)
    setShowNotifications(false)
    if (entry && entry.key === watchKey(notification.property)) {
      // It's on this page: show it in the Property tab, where it can be replied to
      setNotice(null)
      setTab('property')
      setImagesOnly(false)
      setTimeout(() => scrollToComment(panel.current?.getRootNode(), notification.id), 50)
    } else {
      setNotice(notification)
    }
  }

  const tabs: { id: Tab; label: string; icon: ComponentChildren; badge?: ComponentChildren }[] = [
    ...(onPropertyPage
      ? [
          {
            id: 'property' as const,
            label: 'Property',
            icon: <TabIcon tab='property' />,
            badge: count !== null ? <span class='tab-count'>{count}</span> : null,
          },
        ]
      : []),
    { id: 'recent', label: 'Recent', icon: <TabIcon tab='recent' /> },
    {
      id: 'watchlist',
      label: 'Watchlist',
      icon: <TabIcon tab='watchlist' />,
      badge:
        newOnWatchlist > 0 ? (
          <span class='tab-count tab-count--new' title={pluralize(newOnWatchlist, 'new comment')}>
            {newOnWatchlist}
          </span>
        ) : null,
    },
    { id: 'search', label: 'Search', icon: <TabIcon tab='search' /> },
  ]

  return (
    <WatchlistContext.Provider value={watchlist}>
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
            {/* The selected tab, so it's named even when the tabs show only icons (narrow panels, phones) */}
            <p class='eyebrow'>
              {notice ? <BellIcon size={14} /> : <TabIcon tab={tab} size={14} />}
              {notice ? 'Notification' : TAB_HEADINGS[tab]}
            </p>
            <h2 class='panel-title'>{heading.title}</h2>
            <p class='panel-subtitle'>{heading.subtitle}</p>
          </div>
          <div class='header-actions'>
            {entry && tab === 'property' && !notice && <WatchButton entry={entry} newestAt={newestAt} />}
            <NotificationsMenu
              items={notifications.items}
              open={showNotifications}
              onToggle={setShowNotifications}
              onOpen={openNotification}
              onMarkAllRead={notifications.markAllRead}
            />
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

        <div class='tabs-bar'>
          <nav class='tabs' role='tablist' aria-label='Comment views'>
            {tabs.map(({ id, label, icon, badge }) => (
              <button
                key={id}
                type='button'
                role='tab'
                aria-selected={tab === id && !notice}
                onClick={() => {
                  setTab(id)
                  setNotice(null)
                }}
                title={label}
              >
                {icon}
                <span class='tab-label'>{label}</span>
                {badge}
              </button>
            ))}
          </nav>
        </div>

        <div class='panel-scroll' role='tabpanel'>
          {notice ? (
            <NotificationDetail key={notice.id} notification={notice} onBack={() => setNotice(null)} />
          ) : tab === 'property' ? (
            <PropertyTab
              page={page}
              comments={comments}
              view={imagesOnly ? 'images' : sort}
              onView={view => {
                // Newest and Top are remembered; "With images" is a filter for now, so it isn't
                setImagesOnly(view === 'images')
                if (view !== 'images') setSort(view)
              }}
              onSearch={() => setTab('search')}
              replyingTo={draft.replyTo?.id ?? null}
              onReply={comment => onDraft({ replyTo: comment })}
            />
          ) : tab === 'recent' ? (
            <RecentTab
              recent={recent}
              onSearch={() => setTab('search')}
              banner={
                area && areaStats ? (
                  <AreaCard
                    area={area}
                    stats={areaStats}
                    onShow={() => {
                      // The suburb and postcode find every commented property there (see shared/search.ts)
                      setSearchQuery(`${titleCase(area.suburb)} ${area.postcode}`)
                      setTab('search')
                    }}
                  />
                ) : !onPropertyPage ? (
                  <p class='hint-banner'>
                    <InfoIcon />
                    Open a listing on realestate.com.au or domain.com.au to comment on it.
                  </p>
                ) : null
              }
            />
          ) : tab === 'watchlist' ? (
            <WatchlistTab
              watchlist={watchlist}
              comments={watched}
              toolbar={label => (
                <div class='list-toolbar'>
                  <span>{label}</span>
                  <RefreshButton refreshing={watched.refreshing} onRefresh={watched.reload} />
                </div>
              )}
            />
          ) : (
            <SearchTab query={searchQuery} onQuery={setSearchQuery} />
          )}
        </div>

        {tab === 'property' && property && !notice && (
          <div class='panel-composer'>
            <Composer
              property={property.input}
              draft={draft}
              onDraft={onDraft}
              onPosted={comment => {
                comments.update(list => [comment, ...list])
                if (comment.parentId) {
                  // Show the new reply in its thread
                  onDraft({ replyTo: null })
                  setTimeout(() => scrollToComment(panel.current?.getRootNode(), comment.id), 50)
                } else if (sort !== 'newest' || imagesOnly) {
                  // Show the new comment at the top
                  setSort('newest')
                  setImagesOnly(false)
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
            <button type='button' onClick={() => setShowWhatsNew(true)}>
              Changelog
            </button>
            <button type='button' onClick={() => setLegal('terms')}>
              Terms
            </button>
            <button type='button' onClick={() => setLegal('privacy')}>
              Privacy
            </button>
            <a href={complaintsMailto()}>Complaints</a>
            <a href={reportIssueUrl(page)} target='_blank' rel='noopener noreferrer'>
              Report a bug
            </a>
          </div>
        </footer>
        {legal === 'terms' && <TermsDialog onClose={() => setLegal(null)} />}
        {legal === 'privacy' && <PrivacyDialog onClose={() => setLegal(null)} />}
        {review.show && <ReviewDialog onLater={review.later} onDone={review.done} />}
        {showWhatsNew && (
          <WhatsNewDialog
            onClose={() => {
              setShowWhatsNew(false)
              if (whatsNewFor) saveWhatsNewFor('')
            }}
          />
        )}
      </div>
    </WatchlistContext.Provider>
  )
}

function PropertyTab({
  page,
  comments,
  view,
  onView,
  onSearch,
  replyingTo,
  onReply,
}: {
  page: PageState
  comments: ReturnType<typeof useComments>
  view: CommentsView
  onView: (view: CommentsView) => void
  onSearch: () => void
  replyingTo: string | null
  onReply: (comment: CommentView) => void
}) {
  const { threads, byId } = useMemo(() => {
    const list = comments.state.status === 'ready' ? comments.state.data : []
    return { threads: viewThreads(list, view), byId: new Map(list.map(comment => [comment.id, comment])) }
  }, [comments.state, view])

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
        {state.data.length > 0 && (
          <ViewSelect label='Sort or filter comments' value={view} options={COMMENT_VIEWS} onChange={onView} />
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
      {threads.length ? (
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
      ) : (
        <NoImages onShowAll={() => onView('newest')} />
      )}
    </>
  )
}

function RecentTab({
  recent,
  onSearch,
  banner,
}: {
  recent: ReturnType<typeof useRecentComments>
  onSearch: () => void
  // Above the list: the suburb's stats on its search pages, or a hint off property pages
  banner: ComponentChildren
}) {
  const { state, refreshing, reload: onRefresh } = recent
  return (
    <>
      {banner}
      {state.status === 'idle' || state.status === 'loading' ? (
        <Skeleton label='Loading recent comments…' />
      ) : state.status === 'error' ? (
        <ErrorNotice error={state.error} onRetry={onRefresh} />
      ) : (
        <>
          <div class='list-toolbar'>
            <span>{state.data.length ? 'Newest first' : 'No comments yet'}</span>
            <RefreshButton refreshing={refreshing} onRefresh={onRefresh} />
          </div>
          {state.data.length === 0 ? (
            <Notice icon={<MessageIcon />} title='No comments yet' />
          ) : (
            <>
              <div class='comment-list'>
                {state.data.map(comment => (
                  <Comment key={comment.id} comment={comment} />
                ))}
              </div>
              <LoadMore recent={recent} onSearch={onSearch} />
            </>
          )}
        </>
      )}
    </>
  )
}

// The end of the Recent list: loads the next page as it scrolls into view, with a button for keyboards and as a
// fallback, and says when there's no more
function LoadMore({ recent, onSearch }: { recent: ReturnType<typeof useRecentComments>; onSearch: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasMore, loadMore, loadingMore, moreError } = recent
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasMore || moreError) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMoreRef.current()
      },
      // Start loading a little before the end comes into view
      { root: element.closest('.panel-scroll'), rootMargin: '0px 0px 300px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, moreError, recent.state])

  return (
    <div class='load-more' ref={sentinel}>
      {hasMore ? (
        <>
          {moreError && <p class='inline-error'>{moreError}</p>}
          <button type='button' class='button button--ghost' onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : moreError ? 'Try again' : 'Show more'}
          </button>
        </>
      ) : recent.state.status === 'ready' && recent.state.data.length >= MAX_RECENT ? (
        <p>
          That’s the latest {MAX_RECENT}.{' '}
          <button type='button' class='link-button' onClick={onSearch}>
            Search
          </button>{' '}
          to find older comments.
        </p>
      ) : (
        <p>That’s every comment.</p>
      )}
    </div>
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

// The header describes the selected tab. Subtitles stay to one short line, so the header keeps its height (and the
// list doesn't jump) when switching tabs.
function headerFor(
  tab: Tab,
  page: PageState,
  watching: { count: number; fresh: number },
): { title: string; subtitle: string } {
  switch (tab) {
    case 'property':
      if (page.status === 'property') {
        return { title: page.property.displayAddress, subtitle: page.property.displayLocality }
      }
      if (page.status === 'unrecognised')
        return { title: 'Unknown address', subtitle: 'Couldn’t read it from this page' }
      return { title: 'Loading…', subtitle: 'Finding this property’s address' }
    case 'recent':
      return { title: 'Latest comments', subtitle: 'Newest comments across every property' }
    case 'watchlist':
      return {
        title: 'Your watchlist',
        subtitle: watching.count
          ? [
              pluralize(watching.count, 'property', 'properties'),
              watching.fresh ? pluralize(watching.fresh, 'new comment') : 'nothing new',
            ].join(' · ')
          : 'Follow properties for new comments',
      }
    case 'search':
      return { title: 'Search comments', subtitle: 'By address, street, suburb or postcode' }
  }
}
