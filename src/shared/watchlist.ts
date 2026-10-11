import type { CommentView } from './messages'
import type { PropertyInput } from './property'

import { ext } from './ext'
import { buildPropertyKeys, propertyLinks } from './property'

// Properties the user follows, in the panel's Watchlist tab. Kept in `storage.sync`, so it follows them to their other
// devices when their browser syncs extension data (and stays in this browser when it doesn't).
export interface WatchedProperty {
  // watchKey(): one entry per property, however its address was spelt where it was added
  key: string
  // Enough to look the property's comments up (the URL is rebuilt when needed, to keep entries small)
  address: string
  titleAddress?: string
  suburb: string
  state: string
  postcode: string
  displayAddress: string
  displayLocality: string
  addedAt: number
  // The newest comment the user has seen (ms). Comments after it count as new.
  seenAt: number
}

// storage.sync allows 8 KB per item; 25 entries stay well under it
export const MAX_WATCHED = 25
const KEY = 'watchlist'

export function watchKey(property: { address: string; suburb: string; state: string; postcode: string }): string {
  const keys = buildPropertyKeys({ ...property, url: '' })
  return `${keys.address}|${keys.suburb}|${keys.postcode}`
}

// What the background needs to look up a watched property's comments. Watched properties may have been added from
// Search, which has no listing page, so the URL is the property's realestate.com.au profile page.
export function watchedInput(item: WatchedProperty): PropertyInput {
  const { address, titleAddress, suburb, state, postcode } = item
  const input: PropertyInput = {
    address,
    suburb,
    state,
    postcode,
    url: propertyLinks({ address, suburb, state, postcode }).realestate,
  }
  if (titleAddress) input.titleAddress = titleAddress
  return input
}

// Comments by other people posted since the user last looked
export function newComments(comments: CommentView[], seenAt: number): number {
  return comments.filter(comment => !comment.isOwn && comment.createdAt > seenAt).length
}

// storage.sync can be unavailable (some Firefox setups) or full; local storage is the fallback
async function area(): Promise<chrome.storage.StorageArea> {
  try {
    await ext.storage.sync.get(KEY)
    return ext.storage.sync
  } catch {
    return ext.storage.local
  }
}

export async function getWatchlist(): Promise<WatchedProperty[]> {
  const storage = await area()
  const stored: unknown = (await storage.get(KEY))[KEY]
  return Array.isArray(stored) ? (stored as WatchedProperty[]) : []
}

// Read, change and write back, so changes made in another tab aren't lost
export async function updateWatchlist(change: (list: WatchedProperty[]) => WatchedProperty[]): Promise<void> {
  const storage = await area()
  const next = change(await getWatchlist())
  try {
    await storage.set({ [KEY]: next })
  } catch {
    await ext.storage.local.set({ [KEY]: next })
  }
}

export function onWatchlistChange(listener: (list: WatchedProperty[]) => void): () => void {
  const handle = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (KEY in changes) void getWatchlist().then(listener)
  }
  ext.storage.onChanged.addListener(handle)
  return () => ext.storage.onChanged.removeListener(handle)
}
