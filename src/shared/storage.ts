import { ext } from './ext'

// Everything the extension keeps in `storage.local`. Two keys predate 2.0 and must keep their names, or existing
// users would lose their identity (and with it the ability to delete their comments) and have to accept the terms
// again.
export interface StoredData {
  // Anonymous user ID, generated on first use. Legacy key name.
  CTextFilterStore_strCleanPattern_1039531631: string
  // Legacy key: the string 'true' once the terms have been accepted
  tos_accepted: string
  displayName: string
  panelOpen: boolean
  panelWidth: number
  sort: CommentSort
  // Chosen with the panel's theme button; until then the system setting is followed
  theme: Theme
  // Timestamps (ms) of this user's recent comments, for rate limiting
  postHistory: { at: number; property: string }[]
}

export type CommentSort = 'newest' | 'top'
export type Theme = 'light' | 'dark' | 'system'

export async function getStored<K extends keyof StoredData>(key: K): Promise<StoredData[K] | undefined> {
  const result = await ext.storage.local.get(key)
  return result[key] as StoredData[K] | undefined
}

export async function setStored<K extends keyof StoredData>(key: K, value: StoredData[K]): Promise<void> {
  await ext.storage.local.set({ [key]: value })
}
