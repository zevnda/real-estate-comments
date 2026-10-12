import type { NotificationsState } from './notifications'

import { ext } from './ext'

// Everything the extension keeps in `storage.local`. The user ID predates 2.0 and must keep its name, or existing
// users would lose their identity (and with it their votes and "You" on their comments). 1.x and early 2.x also
// stored `tos_accepted`, for older terms; it's no longer read (see postingRulesAccepted).
export interface StoredData {
  // Anonymous user ID, generated on first use. Legacy key name.
  CTextFilterStore_strCleanPattern_1039531631: string
  displayName: string
  panelOpen: boolean
  panelWidth: number
  sort: CommentSort
  // Chosen with the panel's theme button; until then the system setting is followed
  theme: Theme
  // The POSTING_RULES_VERSION the user last agreed to; the rules are shown before their first post after a change
  postingRulesAccepted: number
  // When the extension was installed (or, for users who had it before this was recorded, updated): times the review
  // request
  installedAt: number
  // The review request: 'done' (reviewed or declined), or a time (ms) before which not to ask again
  reviewAsked: number | 'done'
  // Set to the new version when the extension updates; the panel then shows "What's new" once and clears it
  whatsNewFor: string
  // Timestamps (ms) of this user's recent comments, for rate limiting
  postHistory: { at: number; property: string; reply?: boolean }[]
  // The bell's notifications: replies to the user's comments and new comments on watched properties
  notifications: NotificationsState
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
