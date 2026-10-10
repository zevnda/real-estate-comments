import { ext } from '../shared/ext'
import { log } from '../shared/log'

// Caches Firestore reads so the same queries aren't repeated on every page view. Stored in storage.session: shared by
// all tabs, survives Chrome stopping the background service worker (which loses anything in memory after ~30 s
// idle), cleared when the browser closes, and never written to disk. Falls back to memory if storage.session fails.

const PREFIX = 'cache:'
// Entries older than this are deleted during periodic pruning, whatever their TTL
const MAX_AGE = 60 * 60 * 1000
const PRUNE_EVERY_WRITES = 50

interface Entry<T> {
  at: number
  value: T
}

const memory = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
// Bumped by invalidate(), so a fetch that started before a write doesn't cache what it read
let generation = 0
let writes = 0

// A refresh within this long of the last fetch is answered from the cache, so pressing refresh repeatedly (in any
// number of tabs) can't hammer the database
export const MIN_REFRESH_INTERVAL = 30 * 1000

// Returns the cached value for `key` if it's younger than `ttl`, otherwise loads, caches and returns it. Concurrent
// calls for the same key share one load. `fresh` (the user pressed refresh) lowers the TTL to MIN_REFRESH_INTERVAL.
export async function cached<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = await read<T>(key)
  if (hit && Date.now() - hit.at < (fresh ? Math.min(ttl, MIN_REFRESH_INTERVAL) : ttl)) return hit.value
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const startedIn = generation
  const loading = load()
    .then(async value => {
      if (generation === startedIn) await write(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      if (inflight.get(key) === loading) inflight.delete(key)
    })
  inflight.set(key, loading)
  return loading
}

// Drops every cached entry whose key starts with one of the prefixes. Called after the user's own writes.
export async function invalidate(...prefixes: string[]): Promise<void> {
  generation++
  const matches = (key: string) => prefixes.some(prefix => key.startsWith(prefix))
  for (const key of [...memory.keys()]) if (matches(key)) memory.delete(key)
  for (const key of [...inflight.keys()]) if (matches(key)) inflight.delete(key)
  try {
    const stored = await ext.storage.session.get(null)
    const keys = Object.keys(stored).filter(key => key.startsWith(PREFIX) && matches(key.slice(PREFIX.length)))
    if (keys.length) await ext.storage.session.remove(keys)
  } catch (error) {
    log.warn('Clearing the cache failed:', error)
  }
}

async function read<T>(key: string): Promise<Entry<T> | undefined> {
  try {
    const stored = await ext.storage.session.get(PREFIX + key)
    return stored[PREFIX + key] as Entry<T> | undefined
  } catch {
    return memory.get(key) as Entry<T> | undefined
  }
}

async function write(key: string, entry: Entry<unknown>): Promise<void> {
  try {
    await ext.storage.session.set({ [PREFIX + key]: entry })
    if (++writes % PRUNE_EVERY_WRITES === 0) await prune()
  } catch (error) {
    // Most likely the storage.session quota; start over rather than fail the request
    log.warn('Caching failed, clearing the cache:', error)
    memory.set(key, entry)
    await invalidate('')
  }
}

async function prune(): Promise<void> {
  const stored = await ext.storage.session.get(null)
  const expired = Object.entries(stored)
    .filter(([key, entry]) => key.startsWith(PREFIX) && Date.now() - (entry as Entry<unknown>).at > MAX_AGE)
    .map(([key]) => key)
  if (expired.length) await ext.storage.session.remove(expired)
}
