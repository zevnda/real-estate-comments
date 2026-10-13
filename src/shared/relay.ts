import type { PropertyInput } from './property.ts'

// The comment relay (worker/): a Cloudflare Worker that new comments are posted through, so posting limits and bans
// can be enforced by IP address rather than by anything the extension controls (see CLAUDE.md, "Comment relay").
export const RELAY_URL = 'https://rec.zevnda.workers.dev'

// The Turnstile action the challenge page asks for and the relay checks, so a token made for anything else won't do
export const CHALLENGE_ACTION = 'post'

// POST /comment, with the poster's Firebase ID token as `Authorization: Bearer <token>`
export interface RelayCommentRequest {
  property: PropertyInput
  text: string
  username: string
  // The extension's anonymous user ID (`uid` on the comment)
  userId: string
  // The comment being replied to
  replyTo?: string
  turnstileToken: string
}

export interface RelayComment {
  id: string
  // Server time (ms)
  createdAt: number
  parentId?: string
  replyToId?: string
}

// What the challenge page (GET /challenge) posts to the property page, as a JSON string (plain strings cross
// Firefox's content script boundary without any wrapping)
export type ChallengeMessage = { source: 'rec-challenge' } & (
  | { type: 'token'; token: string }
  | { type: 'expired' }
  | { type: 'error'; code: string }
  | { type: 'interactive'; on: boolean }
)

export function parseChallengeMessage(data: unknown): ChallengeMessage | null {
  if (typeof data !== 'string' || data.length > 4096) return null
  let message: unknown
  try {
    message = JSON.parse(data)
  } catch {
    return null
  }
  if (!message || typeof message !== 'object') return null
  const { source, type, token, code, on } = message as Record<string, unknown>
  if (source !== 'rec-challenge') return null
  if (type === 'token' && typeof token === 'string' && token) return { source, type, token }
  if (type === 'expired') return { source, type }
  if (type === 'error') return { source, type, code: typeof code === 'string' ? code : String(code) }
  if (type === 'interactive' && typeof on === 'boolean') return { source, type, on }
  return null
}

// POST /edit, signed in like /comment: the poster changes their comment's text within EDIT_WINDOW_MS
export interface RelayEditRequest {
  commentId: string
  text: string
  // The extension's anonymous user ID, for the ban check
  userId: string
}

export interface RelayEdit {
  text: string
  // Server time (ms)
  editedAt: number
}

// POST /report, signed in like /comment
export interface RelayReportRequest {
  commentId: string
  reason: string
  details: string
  // The extension's anonymous user ID, for the ban check
  userId: string
}

// POST /vote, signed in like /comment: upvotes the comment, or takes the upvote back
export interface RelayVoteRequest {
  commentId: string
  // The extension's anonymous user ID, the key in the comment's `userVotes`
  userId: string
}

export interface RelayVote {
  votes: number
  hasVoted: boolean
}
