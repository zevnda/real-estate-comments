import type { CommentView } from '../../shared/messages'
import type { AppNotification, NotificationKind } from '../../shared/notifications'
import type { Loadable } from '../hooks'

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { propertyLinks } from '../../shared/property'
import { watchedInput } from '../../shared/watchlist'
import { formatAbsolute, formatRelative } from '../format'
import { errorMessage } from '../hooks'
import { excerpt } from '../threads'
import { scrollToComment } from './Comment'
import { DetailComments } from './DetailComments'
import { BellIcon, CheckIcon, ChevronLeftIcon, MessageIcon, ReplyIcon, StarIcon } from './icons'
import { PropertyLinks } from './PropertyLinks'
import { ErrorNotice, Notice, Skeleton } from './states'
import { WatchButton, watchEntry, WatchlistContext } from './Watchlist'

const ACTIONS: Record<NotificationKind, string> = {
  reply: 'replied to your comment',
  thread: 'replied in a conversation you started',
  watch: 'commented on a property you’re watching',
}

// The header's bell, with the unread count, and its dropdown. Closes on Esc, on choosing a notification, or on a click
// anywhere else in the panel (clicks outside the panel close the panel itself).
export function NotificationsMenu({
  items,
  open,
  onToggle,
  onOpen,
  onMarkAllRead,
}: {
  items: AppNotification[]
  open: boolean
  onToggle: (open: boolean) => void
  onOpen: (notification: AppNotification) => void
  onMarkAllRead: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const unread = items.filter(item => !item.read)
  const read = items.filter(item => item.read)
  const label = unread.length ? `Notifications (${unread.length} unread)` : 'Notifications'

  useEffect(() => {
    const shadow = root.current?.getRootNode()
    if (!open || !(shadow instanceof ShadowRoot)) return
    const onPointerDown = (event: Event) => {
      if (root.current && !event.composedPath().includes(root.current)) onToggle(false)
    }
    shadow.addEventListener('pointerdown', onPointerDown, true)
    return () => shadow.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  // Before paint, so Esc pressed straight away reaches the menu rather than closing the panel
  useLayoutEffect(() => {
    if (open) menu.current?.focus()
  }, [open])

  return (
    <div
      class='bell'
      ref={root}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          // Close only the menu, not the whole panel
          event.stopPropagation()
          onToggle(false)
          button.current?.focus()
        }
      }}
    >
      <button
        ref={button}
        type='button'
        class={`icon-button bell-button${open ? ' icon-button--pressed' : ''}`}
        onClick={() => onToggle(!open)}
        aria-label={label}
        aria-expanded={open}
        aria-controls='rec-notifications'
        title={label}
      >
        <BellIcon />
        {unread.length > 0 && (
          <span class='bell-count' aria-hidden='true'>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div
          id='rec-notifications'
          class='notifications-menu'
          ref={menu}
          role='dialog'
          aria-labelledby='rec-notifications-title'
          tabIndex={-1}
        >
          <header class='notifications-menu-header'>
            <h3 id='rec-notifications-title'>Notifications</h3>
            {unread.length > 0 && <span>{unread.length} unread</span>}
          </header>
          <div class='notifications-menu-body'>
            {items.length === 0 ? (
              <p class='notifications-empty'>
                Nothing yet. Replies to your comments, and new comments on properties you’re watching, will show up
                here.
              </p>
            ) : (
              <>
                {unread.length > 0 && <NotificationList label='New' items={unread} onOpen={onOpen} />}
                {read.length > 0 && <NotificationList label='Earlier' items={read} onOpen={onOpen} />}
              </>
            )}
          </div>
          <button type='button' class='notifications-menu-footer' onClick={onMarkAllRead} disabled={!unread.length}>
            <CheckIcon />
            Mark all as read
          </button>
        </div>
      )}
    </div>
  )
}

function NotificationList({
  label,
  items,
  onOpen,
}: {
  label: string
  items: AppNotification[]
  onOpen: (notification: AppNotification) => void
}) {
  return (
    <section class='notification-group'>
      <h4>{label}</h4>
      <ul class='notification-list'>
        {items.map(item => (
          <li key={item.id}>
            <button
              type='button'
              class={`notification${item.read ? '' : ' notification--unread'}`}
              onClick={() => onOpen(item)}
            >
              <span class='notification-icon' aria-hidden='true'>
                {item.kind === 'watch' ? <StarIcon size={16} /> : <ReplyIcon />}
              </span>
              <span class='notification-main'>
                <span class='notification-title'>
                  <strong>{item.username}</strong> {ACTIONS[item.kind]}
                </span>
                <span class='notification-text'>{excerpt(item.text)}</span>
                <span class='notification-meta'>
                  {item.property.displayAddress}, {item.property.displayLocality} ·{' '}
                  <time title={formatAbsolute(item.createdAt)}>{formatRelative(item.createdAt)}</time>
                </span>
              </span>
              {!item.read && <span class='visually-hidden'>Unread</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// A notification's property, opened in the panel with the comment highlighted. Like a search result: comments can be
// read, voted on and reported, but replying needs the property's own page.
export function NotificationDetail({ notification, onBack }: { notification: AppNotification; onBack: () => void }) {
  const { property } = notification
  const [state, setState] = useState<Loadable<CommentView[]>>({ status: 'loading' })
  const container = useRef<HTMLDivElement>(null)
  const watchlist = useContext(WatchlistContext)
  const entry = watchEntry(property, property.displayAddress, property.displayLocality)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    callBackground('listComments', { property: watchedInput(property) }).then(
      data => current && setState({ status: 'ready', data }),
      (error: unknown) => current && setState({ status: 'error', error: errorMessage(error) }),
    )
    return () => {
      current = false
    }
  }, [notification.id])

  const loaded = state.status === 'ready'
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => scrollToComment(container.current?.getRootNode(), notification.id), 50)
    // Seeing a watched property's comments counts as having seen them, as in the Watchlist
    const newestAt = Math.max(0, ...state.data.map(comment => comment.createdAt))
    if (newestAt && watchlist?.isWatched(entry.key)) watchlist.markSeen(entry.key, newestAt)
    return () => clearTimeout(timer)
  }, [loaded, notification.id])

  return (
    <div class='search-detail' ref={container}>
      <button type='button' class='text-button back-button' onClick={onBack}>
        <ChevronLeftIcon />
        Back
      </button>
      <div class='search-detail-heading'>
        <div class='detail-title'>
          <h3>{property.displayAddress}</h3>
          <WatchButton entry={entry} variant='text' />
        </div>
        <p>{property.displayLocality}</p>
        <PropertyLinks links={propertyLinks(property)} />
      </div>
      {state.status === 'ready' ? (
        state.data.length ? (
          <>
            {!state.data.some(comment => comment.id === notification.id) && (
              <p class='hint-banner'>
                <MessageIcon />
                That comment has since been deleted.
              </p>
            )}
            <DetailComments
              comments={state.data}
              onUpdate={change =>
                setState(previous =>
                  previous.status === 'ready' ? { status: 'ready', data: change(previous.data) } : previous,
                )
              }
            />
          </>
        ) : (
          <Notice icon={<MessageIcon />} title='No comments'>
            The comments on this property have since been deleted.
          </Notice>
        )
      ) : state.status === 'error' ? (
        <ErrorNotice error={state.error} onRetry={onBack} />
      ) : (
        <Skeleton label='Loading comments…' />
      )}
    </div>
  )
}
