import type * as CacheModule from '../src/background/cache'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for chrome.storage.session
function fakeSessionStorage() {
  const data: Record<string, unknown> = {}
  return {
    data,
    get: vi.fn(async (key: string | null) => (key === null ? { ...data } : { [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, items)),
    remove: vi.fn(async (keys: string[]) => keys.forEach(key => delete data[key])),
  }
}

let session: ReturnType<typeof fakeSessionStorage>
let cache: typeof CacheModule

beforeEach(async () => {
  session = fakeSessionStorage()
  ;(globalThis as { chrome?: unknown }).chrome = { storage: { session } }
  vi.resetModules()
  cache = await import('../src/background/cache')
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as { chrome?: unknown }).chrome
})

describe('cached', () => {
  it('loads once, then serves from the cache until the TTL passes', async () => {
    const load = vi.fn(async () => ['a'])
    expect(await cache.cached('k', 1000, load)).toEqual(['a'])
    expect(await cache.cached('k', 1000, load)).toEqual(['a'])
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1001)
    await cache.cached('k', 1000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps entries in storage.session, so they survive the service worker restarting', async () => {
    await cache.cached('k', 1000, async () => 42)
    vi.resetModules()
    const restarted = await import('../src/background/cache')
    const load = vi.fn(async () => 0)
    expect(await restarted.cached('k', 1000, load)).toBe(42)
    expect(load).not.toHaveBeenCalled()
  })

  it('refreshes on request, but at most once per MIN_REFRESH_INTERVAL', async () => {
    const fiveMinutes = 5 * 60 * 1000
    const load = vi.fn(async () => Date.now())
    await cache.cached('k', fiveMinutes, load)

    // Spamming refresh straight after a fetch is answered from the cache
    for (let i = 0; i < 10; i++) await cache.cached('k', fiveMinutes, load, true)
    expect(load).toHaveBeenCalledTimes(1)

    // Once the interval has passed, a refresh fetches again (well within the normal TTL)
    vi.advanceTimersByTime(cache.MIN_REFRESH_INTERVAL)
    await cache.cached('k', fiveMinutes, load, true)
    expect(load).toHaveBeenCalledTimes(2)
    await cache.cached('k', fiveMinutes, load, true)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares one load between concurrent callers', async () => {
    let resolve!: (value: string) => void
    const load = vi.fn(() => new Promise<string>(r => (resolve = r)))
    const first = cache.cached('k', 1000, load)
    const second = cache.cached('k', 1000, load)
    await vi.waitFor(() => expect(load).toHaveBeenCalled())
    resolve('done')
    expect(await Promise.all([first, second])).toEqual(['done', 'done'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('caches empty results too (most properties have no comments)', async () => {
    const load = vi.fn(async () => [])
    await cache.cached('k', 1000, load)
    await cache.cached('k', 1000, load)
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('invalidate', () => {
  it('drops entries with the given prefixes only', async () => {
    await cache.cached('property:a', 1000, async () => 1)
    await cache.cached('banned:u', 1000, async () => false)
    await cache.invalidate('property:', 'recent')

    const reload = vi.fn(async () => 2)
    expect(await cache.cached('property:a', 1000, reload)).toBe(2)
    const banReload = vi.fn(async () => true)
    expect(await cache.cached('banned:u', 1000, banReload)).toBe(false)
    expect(banReload).not.toHaveBeenCalled()
  })

  it('doesn’t cache a read that started before a write', async () => {
    let resolve!: (value: string) => void
    const slowLoad = vi.fn(() => new Promise<string>(r => (resolve = r)))
    const stale = cache.cached('property:a', 1000, slowLoad)
    // The read is under way (waiting on Firestore) when the user's own write happens
    await vi.waitFor(() => expect(slowLoad).toHaveBeenCalled())
    await cache.invalidate('property:')
    resolve('before the write')
    await stale

    const load = vi.fn(async () => 'after the write')
    expect(await cache.cached('property:a', 1000, load)).toBe('after the write')
  })
})
