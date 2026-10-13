import type { ComponentChildren } from 'preact'
import type { CommentView } from '../../shared/messages'
import type { WatchedProperty } from '../../shared/watchlist'
import type { Loadable, useWatchedComments, WatchEntry, Watchlist } from '../hooks'

import { createContext } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'

import { propertyLinks } from '../../shared/property'
import { MAX_WATCHED, newComments, watchKey } from '../../shared/watchlist'
import { pluralize } from '../format'
import { DetailComments } from './DetailComments'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, StarIcon } from './icons'
import { PropertyLinks } from './PropertyLinks'
import { ErrorNotice, Notice, Skeleton } from './states'

// A watchlist entry for a property, from its address fields and how the panel shows it
export function watchEntry(
  property: { address: string; titleAddress?: string; suburb: string; state: string; postcode: string },
  displayAddress: string,
  displayLocality: string,
): WatchEntry {
  const { address, titleAddress, suburb, state, postcode } = property
  return {
    key: watchKey(property),
    address,
    ...(titleAddress && { titleAddress }),
    suburb,
    state,
    postcode,
    displayAddress,
    displayLocality,
  }
}

// The watchlist, provided by the panel to everything that shows a Watch button
export const WatchlistContext = createContext<Watchlist | null>(null)

// ☆ / ★ toggle for a property. `newestAt` is the newest comment currently shown, so only later ones count as new.
export function WatchButton({
  entry,
  newestAt,
  variant = 'icon',
}: {
  entry: WatchEntry
  newestAt?: number
  variant?: 'icon' | 'text'
}) {
  const watchlist = useContext(WatchlistContext)
  if (!watchlist) return null
  const watched = watchlist.isWatched(entry.key)
  const disabled = !watched && watchlist.full
  const label = watched
    ? 'Stop watching this property'
    : disabled
      ? `Your watchlist is full (${MAX_WATCHED} properties)`
      : 'Watch this property for new comments'
  const toggle = () => (watched ? watchlist.unwatch(entry.key) : watchlist.watch(entry, newestAt))
  return variant === 'icon' ? (
    <button
      type='button'
      class={`icon-button${watched ? ' icon-button--active' : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={watched}
      aria-label={label}
      title={label}
    >
      <StarIcon size={18} filled={watched} />
    </button>
  ) : (
    <button
      type='button'
      class={`watch-button${watched ? ' watch-button--active' : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={watched}
      title={label}
    >
      <StarIcon size={14} filled={watched} />
      {watched ? 'Watching' : 'Watch'}
    </button>
  )
}

interface WatchlistTabProps {
  watchlist: Watchlist
  comments: ReturnType<typeof useWatchedComments>
  toolbar: (label: string) => ComponentChildren
}

export function WatchlistTab({ watchlist, comments, toolbar }: WatchlistTabProps) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = watchlist.items.find(item => item.key === openKey) ?? null

  if (open) {
    return (
      <WatchedDetail
        item={open}
        state={comments.byKey[open.key] ?? { status: 'loading' }}
        onBack={() => setOpenKey(null)}
        onSeen={at => watchlist.markSeen(open.key, at)}
        onUpdate={change => comments.update(open.key, change)}
      />
    )
  }

  if (!watchlist.items.length) {
    return (
      <Notice icon={<StarIcon size={20} />} title='Nothing on your watchlist yet'>
        On a listing, press ☆ next to the address on the Property tab, or press Watch on a property you’ve found in
        Search. Its comments are then followed here, and new ones since you last looked are marked here and show up
        under the bell.
      </Notice>
    )
  }

  return (
    <>
      {toolbar(`Watching ${watchlist.items.length} of ${MAX_WATCHED}`)}
      <ul class='search-results watch-results' aria-label='Watched properties'>
        {watchlist.items.map(item => {
          const state = comments.byKey[item.key]
          const fresh = state?.status === 'ready' ? newComments(state.data, item.seenAt) : 0
          return (
            <li key={item.key} class='watch-result'>
              <button type='button' class='search-result' onClick={() => setOpenKey(item.key)}>
                <span class='search-result-main'>
                  <span class='search-result-address'>{item.displayAddress}</span>
                  <span class='search-result-locality'>{item.displayLocality}</span>
                </span>
                <span class='search-result-meta'>
                  {state?.status === 'ready'
                    ? state.data.length
                      ? pluralize(state.data.length, 'comment')
                      : 'No comments'
                    : state?.status === 'error'
                      ? 'Couldn’t load'
                      : '…'}
                  {fresh > 0 && <span class='chip chip--accent'>{fresh} new</span>}
                </span>
                <ChevronRightIcon />
              </button>
              <button
                type='button'
                class='icon-button icon-button--small'
                onClick={() => watchlist.unwatch(item.key)}
                aria-label={`Stop watching ${item.displayAddress}`}
                title='Stop watching'
              >
                <CloseIcon />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function WatchedDetail({
  item,
  state,
  onBack,
  onSeen,
  onUpdate,
}: {
  item: WatchedProperty
  state: Loadable<CommentView[]>
  onBack: () => void
  onSeen: (at: number) => void
  onUpdate: (change: (comments: CommentView[]) => CommentView[]) => void
}) {
  const links = propertyLinks(item)
  const data = state.status === 'ready' ? state.data : null
  const newestAt = data ? Math.max(0, ...data.map(comment => comment.createdAt)) : 0

  // Opening it counts as seeing its comments
  useEffect(() => {
    if (newestAt) onSeen(newestAt)
  }, [newestAt])

  return (
    <div class='search-detail'>
      <button type='button' class='text-button back-button' onClick={onBack}>
        <ChevronLeftIcon />
        Watchlist
      </button>
      <div class='search-detail-heading'>
        <div class='detail-title'>
          <h3>{item.displayAddress}</h3>
          <WatchButton entry={item} variant='text' />
        </div>
        <p>{item.displayLocality}</p>
        <PropertyLinks links={links} />
      </div>
      {state.status === 'ready' ? (
        state.data.length ? (
          <DetailComments comments={state.data} onUpdate={onUpdate} />
        ) : (
          <Notice icon={<StarIcon size={20} />} title='No comments yet'>
            You’ll see them here when someone comments. Open the property’s page to add the first one.
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
