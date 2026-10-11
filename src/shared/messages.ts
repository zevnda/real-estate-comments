import type { Area, PropertyInput, PropertyLinks } from './property'

import { ext } from './ext'

export interface CommentView {
  id: string
  text: string
  username: string
  // Milliseconds since the epoch
  createdAt: number
  votes: number
  hasVoted: boolean
  isOwn: boolean
  // Only comments that record the poster's Firebase Auth UID can be deleted (the security rules check it), so the
  // user's own comments from before that can't
  canDelete: boolean
  // Until when (ms) the user can edit it: their own deletable comments, for EDIT_WINDOW_MS after posting
  editableUntil?: number
  // When it was last edited (ms)
  editedAt?: number
  // Replies: the top-level comment the reply is under, and the comment it answers (the same, or another reply)
  parentId?: string
  replyToId?: string
}

export interface RecentCommentView extends CommentView {
  displayAddress: string
  displayLocality: string
  // Profile pages on both sites, built from the address. Not the listing the comment was posted on: listings get
  // removed once a property is rented or sold. Null for the odd old comment without a state or postcode.
  links: PropertyLinks | null
}

// A property found by address search, with its comments (newest first)
export interface SearchResult {
  id: string
  displayAddress: string
  displayLocality: string
  links: PropertyLinks
  // For the watchlist: null for the odd old comment without a state or postcode
  property: { address: string; suburb: string; state: string; postcode: string } | null
  latestAt: number
  comments: CommentView[]
}

export interface AreaStats {
  comments: number
  properties: number
  capped: boolean
}

// Requests the content script sends to the background script, and what each one returns
export interface BackgroundApi {
  // `fresh` skips the background's cache (the panel's refresh button)
  listComments: { request: { property: PropertyInput; fresh?: boolean }; response: CommentView[] }
  recentComments: { request: { fresh?: boolean }; response: RecentCommentView[] }
  // `replyTo`: the comment being replied to, which must be on the same property
  createComment: {
    request: { property: PropertyInput; text: string; username: string; replyTo?: string }
    response: CommentView
  }
  editComment: { request: { commentId: string; text: string }; response: { text: string; editedAt: number } }
  toggleVote: { request: { commentId: string }; response: { votes: number; hasVoted: boolean } }
  deleteComment: { request: { commentId: string }; response: null }
  reportComment: { request: { commentId: string; reason: string; details: string }; response: null }
  searchComments: { request: { query: string }; response: SearchResult[] }
  // How much has been said about a suburb, for its search results pages
  // `capped`: the suburb has more comments than one lookup reads, so the counts are a minimum
  areaStats: { request: { area: Area }; response: AreaStats }
  setBadge: { request: { count: number | null }; response: null }
}

export type BackgroundRequest = {
  [K in keyof BackgroundApi]: { type: K } & BackgroundApi[K]['request']
}[keyof BackgroundApi]

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Messages the background script sends to a tab's content script
export type ContentMessage = { type: 'togglePanel' }

export class ExtensionError extends Error {
  override name = 'ExtensionError'
}

export async function callBackground<K extends keyof BackgroundApi>(
  type: K,
  request: BackgroundApi[K]['request'],
): Promise<BackgroundApi[K]['response']> {
  let result: Result<BackgroundApi[K]['response']> | undefined
  try {
    result = await ext.runtime.sendMessage<BackgroundRequest, typeof result>({ type, ...request } as BackgroundRequest)
  } catch (error) {
    // Happens when the extension is reloaded or updated while this tab is open ("Extension context invalidated")
    throw new ExtensionError('Real Estate Comments was updated or restarted. Refresh the page to keep using it.', {
      cause: error,
    })
  }
  if (!result) throw new ExtensionError('No response from the extension. Refresh the page and try again.')
  if (!result.ok) throw new ExtensionError(result.error)
  return result.data
}
