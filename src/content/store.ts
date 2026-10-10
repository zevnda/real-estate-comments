import { useEffect, useState } from 'preact/hooks'

// A minimal observable value, for passing state from the non-UI parts of the content script into the UI
export interface Store<T> {
  get(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      value = next
      listeners.forEach(listener => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  const [, setVersion] = useState(0)
  useEffect(() => store.subscribe(() => setVersion(n => n + 1)), [store])
  return store.get()
}
