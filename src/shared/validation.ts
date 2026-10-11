import type { PropertyInput } from './property'

import { getSite, hasStreetNumber, STATES } from './property'

export const COMMENT_MIN_LENGTH = 5
export const COMMENT_MAX_LENGTH = 1200
export const COMMENT_MAX_LINES = 50
export const USERNAME_MAX_LENGTH = 50
export const DEFAULT_USERNAME = 'Anonymous'
// How long after posting a comment can be edited. The security rules enforce the same window.
export const EDIT_WINDOW_MS = 15 * 60 * 1000

// Returns a user-facing reason the comment can't be posted, or null if it's fine. Runs in the panel (for instant
// feedback) and again in the background script (which is the one that matters).
export function validateCommentText(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length < COMMENT_MIN_LENGTH) return `Comments need at least ${COMMENT_MIN_LENGTH} characters.`
  if (trimmed.length > COMMENT_MAX_LENGTH) return `Comments can't be longer than ${COMMENT_MAX_LENGTH} characters.`
  if (trimmed.split('\n').length > COMMENT_MAX_LINES) return `Comments can't have more than ${COMMENT_MAX_LINES} lines.`
  if (/(.)\1{10,}/.test(trimmed)) return 'Your comment has too many repeated characters.'
  return null
}

export function cleanUsername(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, USERNAME_MAX_LENGTH)
  return trimmed || DEFAULT_USERNAME
}

// Runtime check of property details received in a message, since the background script can't trust its callers.
export function isPropertyInput(value: unknown): value is PropertyInput {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  const strings = ['address', 'suburb', 'state', 'postcode', 'url'].every(key => {
    const field = input[key]
    return typeof field === 'string' && field.length <= 300
  })
  if (!strings) return false
  if (input.titleAddress !== undefined && (typeof input.titleAddress !== 'string' || input.titleAddress.length > 300)) {
    return false
  }
  const { address, suburb, state, postcode, url } = input as unknown as PropertyInput
  let host: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    host = parsed.hostname
  } catch {
    return false
  }
  return (
    getSite(host) !== null &&
    hasStreetNumber(address) &&
    suburb.trim().length > 0 &&
    (STATES as readonly string[]).includes(state) &&
    /^\d{4}$/.test(postcode)
  )
}
