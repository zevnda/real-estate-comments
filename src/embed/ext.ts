// Stands in for src/shared/ext.ts in the embed's build (scripts/build.ts swaps it in), so the extension's UI runs in
// the embed unchanged. What the UI uses of the extension APIs:
// - storage: kept in localStorage, which in a partner's iframe is partitioned by the browser (separate per site).
//   If it's blocked (some privacy settings), values last until the page is closed.
// - runtime.sendMessage: the UI's requests to the background script (callBackground), answered by the embed's
//   handler (see api.ts) with relay requests instead.
// - runtime.getManifest: the version, for the bug report link.

type Changes = Record<string, chrome.storage.StorageChange>
type Listener = (changes: Changes, area: string) => void

const PREFIX = 'rec:'
const memory = new Map<string, unknown>()
// Values that come from the embed's URL (e.g. the theme) rather than what the viewer chose
const overrides = new Map<string, unknown>()
const listeners = new Set<Listener>()

export function readValue(key: string): unknown {
  if (overrides.has(key)) return overrides.get(key)
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw !== null) return JSON.parse(raw) as unknown
  } catch {
    // Blocked or unreadable: fall back to this page's copy
  }
  return memory.get(key)
}

export function writeValue(key: string, value: unknown) {
  const oldValue = readValue(key)
  memory.set(key, value)
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Kept in memory only
  }
  const changes: Changes = { [key]: { oldValue, newValue: value } }
  for (const listener of listeners) listener(changes, 'local')
}

export function overrideValue(key: string, value: unknown) {
  overrides.set(key, value)
}

type Handler = (message: unknown) => Promise<unknown>
let handler: Handler = () => Promise.resolve({ ok: false, error: 'Not ready yet. Please try again.' })

export function setMessageHandler(next: Handler) {
  handler = next
}

const keysOf = (keys: string | string[] | Record<string, unknown> | null | undefined): string[] =>
  keys == null ? [] : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)

const area = {
  get(keys?: string | string[] | Record<string, unknown> | null) {
    const result: Record<string, unknown> = {}
    for (const key of keysOf(keys)) {
      const value = readValue(key)
      if (value !== undefined) result[key] = value
    }
    return Promise.resolve(result)
  },
  set(items: Record<string, unknown>) {
    for (const [key, value] of Object.entries(items)) writeValue(key, value)
    return Promise.resolve()
  },
  remove(keys: string | string[]) {
    for (const key of keysOf(keys)) {
      memory.delete(key)
      try {
        localStorage.removeItem(PREFIX + key)
      } catch {
        // Nothing to remove
      }
    }
    return Promise.resolve()
  },
}

export const ext = {
  runtime: {
    id: 'embed',
    sendMessage: (message: unknown) => handler(message),
    getManifest: () => ({ version: 'embed' }),
    onMessage: { addListener: () => {}, removeListener: () => {} },
  },
  storage: {
    local: area,
    sync: area,
    session: area,
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
  },
} as unknown as typeof chrome
