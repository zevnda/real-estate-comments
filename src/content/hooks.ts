import type { CommentView, RecentCommentView } from '../shared/messages'
import type { PropertyInput } from '../shared/property'
import type { StoredData } from '../shared/storage'
import type { WatchedProperty } from '../shared/watchlist'

import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { log } from '../shared/log'
import { callBackground } from '../shared/messages'
import { getStored, setStored } from '../shared/storage'
import { getWatchlist, MAX_WATCHED, onWatchlistChange, updateWatchlist, watchedInput } from '../shared/watchlist'

export type Loadable<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string }

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function propertyId(property: PropertyInput | null): string | null {
  return property ? JSON.stringify([property.url, property.address, property.suburb, property.postcode]) : null
}

// Comments for the current property. Loaded state is tagged with the property it belongs to, so after navigating,
// neither the previous listing's comments nor a slow response for it can ever be shown (or acted on).
export function useComments(property: PropertyInput | null) {
  const id = propertyId(property)
  const [stored, setStored] = useState<{ id: string | null; value: Loadable<CommentView[]> }>({
    id: null,
    value: { status: 'idle' },
  })
  const [refreshing, setRefreshing] = useState(false)
  const currentId = useRef(id)
  currentId.current = id

  // `fresh` skips the background's cache (the refresh button); page loads use the cache
  const load = useCallback(
    async (fresh: boolean) => {
      if (!property || !id) return
      // A refresh or retry keeps showing the current list (if any) until the new one arrives
      setStored(previous =>
        previous.id === id && previous.value.status === 'ready' ? previous : { id, value: { status: 'loading' } },
      )
      if (fresh) setRefreshing(true)
      try {
        const data = await callBackground('listComments', { property, fresh })
        setStored(previous => (currentId.current === id ? { id, value: { status: 'ready', data } } : previous))
      } catch (error) {
        log.warn('Loading comments failed:', error)
        setStored(previous =>
          currentId.current === id ? { id, value: { status: 'error', error: errorMessage(error) } } : previous,
        )
      } finally {
        setRefreshing(false)
      }
    },
    // `id` identifies `property`, which is a new object on every render
    [id],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const reload = useCallback(() => void load(true), [load])

  const update = useCallback(
    (change: (comments: CommentView[]) => CommentView[]) => {
      setStored(previous =>
        previous.id === id && previous.value.status === 'ready'
          ? { id, value: { status: 'ready', data: change(previous.value.data) } }
          : previous,
      )
    },
    [id],
  )

  const state: Loadable<CommentView[]> =
    stored.id === id ? stored.value : id ? { status: 'loading' } : { status: 'idle' }
  return { state, reload, refreshing, update }
}

export function useRecentComments(enabled: boolean) {
  const [state, setState] = useState<Loadable<RecentCommentView[]>>({ status: 'idle' })
  const [refreshing, setRefreshing] = useState(false)
  const load = useCallback(async (fresh: boolean) => {
    setState(previous => (previous.status === 'ready' ? previous : { status: 'loading' }))
    if (fresh) setRefreshing(true)
    try {
      setState({ status: 'ready', data: await callBackground('recentComments', { fresh }) })
    } catch (error) {
      setState({ status: 'error', error: errorMessage(error) })
    } finally {
      setRefreshing(false)
    }
  }, [])
  useEffect(() => {
    if (enabled && state.status === 'idle') void load(false)
  }, [enabled, state.status, load])
  const reload = useCallback(() => void load(true), [load])
  return { state, reload, refreshing }
}

// A value kept in extension storage, so it's shared by every realestate.com.au and domain.com.au tab
export function useStored<K extends keyof StoredData>(key: K, fallback: StoredData[K]) {
  const [value, setValue] = useState<StoredData[K]>(fallback)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    getStored(key)
      .then(stored => {
        if (stored !== undefined) setValue(stored)
      })
      .catch(error => log.warn(`Reading ${key} failed:`, error))
      .finally(() => setLoaded(true))
  }, [key])
  const save = useCallback(
    (next: StoredData[K]) => {
      setValue(next)
      setStored(key, next).catch(error => log.warn(`Saving ${key} failed:`, error))
    },
    [key],
  )
  return [value, save, loaded] as const
}

export type WatchEntry = Omit<WatchedProperty, 'addedAt' | 'seenAt'>

// The user's watchlist, kept in step across tabs
export function useWatchlist() {
  const [items, setItems] = useState<WatchedProperty[]>([])
  useEffect(() => {
    getWatchlist()
      .then(setItems)
      .catch(error => log.warn('Reading the watchlist failed:', error))
    return onWatchlistChange(setItems)
  }, [])

  const save = useCallback((change: (list: WatchedProperty[]) => WatchedProperty[]) => {
    // Update straight away; storage confirms it (and tells other tabs)
    setItems(change)
    updateWatchlist(change).catch(error => log.warn('Saving the watchlist failed:', error))
  }, [])

  return {
    items,
    full: items.length >= MAX_WATCHED,
    isWatched: (key: string) => items.some(item => item.key === key),
    // `newestAt`: the newest comment the user can see right now, so only later ones count as new
    watch: (entry: WatchEntry, newestAt = Date.now()) =>
      save(list =>
        list.some(item => item.key === entry.key) || list.length >= MAX_WATCHED
          ? list
          : [{ ...entry, addedAt: Date.now(), seenAt: newestAt }, ...list],
      ),
    unwatch: (key: string) => save(list => list.filter(item => item.key !== key)),
    markSeen: (key: string, at: number) => {
      // Only write when it changes anything: this runs whenever a watched property's comments are shown
      if (!items.some(item => item.key === key && at > item.seenAt)) return
      save(list => list.map(item => (item.key === key && at > item.seenAt ? { ...item, seenAt: at } : item)))
    },
  }
}

export type Watchlist = ReturnType<typeof useWatchlist>

// Comments for each watched property, looked up through the background's cache (so reopening the panel is cheap)
export function useWatchedComments(items: WatchedProperty[], enabled: boolean) {
  const [byKey, setByKey] = useState<Record<string, Loadable<CommentView[]>>>({})
  const [refreshing, setRefreshing] = useState(false)
  const keys = items.map(item => item.key).join('|')

  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setRefreshing(true)
      await Promise.all(
        items.map(async item => {
          setByKey(previous =>
            previous[item.key]?.status === 'ready' ? previous : { ...previous, [item.key]: { status: 'loading' } },
          )
          try {
            const data = await callBackground('listComments', { property: watchedInput(item), fresh })
            setByKey(previous => ({ ...previous, [item.key]: { status: 'ready', data } }))
          } catch (error) {
            setByKey(previous => ({ ...previous, [item.key]: { status: 'error', error: errorMessage(error) } }))
          }
        }),
      )
      setRefreshing(false)
    },
    // `keys` identifies `items`
    [keys],
  )

  useEffect(() => {
    if (enabled) void load(false)
  }, [enabled, load])

  const update = useCallback((key: string, change: (comments: CommentView[]) => CommentView[]) => {
    setByKey(previous => {
      const current = previous[key]
      return current?.status === 'ready'
        ? { ...previous, [key]: { status: 'ready', data: change(current.data) } }
        : previous
    })
  }, [])

  return { byKey, refreshing, reload: useCallback(() => void load(true), [load]), update }
}
