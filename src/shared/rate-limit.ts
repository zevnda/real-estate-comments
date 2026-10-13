// The comment relay's limits per network (worker/src/relay.ts), for posts, edits and reports. Aimed at flooding, not
// at rationing normal use. Pure, so it's tested directly.

export interface PostRecord {
  // When it happened (ms)
  at: number
}

export interface PostLimits {
  // Minimum time between two
  cooldownMs: number
  perHour: number
  perDay: number
  // For the messages: "Up to 5 comments an hour can be posted…", "Please wait 10 seconds before posting again."
  things: string
  done: string
  doing: string
}

const SECOND = 1000
export const HOUR = 60 * 60 * SECOND
export const DAY = 24 * HOUR

// Returns a user-facing reason it isn't allowed yet, or null if it is
export function rateLimitReason(history: PostRecord[], now: number, limits: PostLimits): string | null {
  const last = Math.max(0, ...history.map(post => post.at))
  const wait = last + limits.cooldownMs - now
  if (wait > 0) return `Please wait ${Math.ceil(wait / SECOND)} seconds before ${limits.doing} again.`
  const cap = (count: number, period: string, retry: string) =>
    `Up to ${count} ${limits.things} ${period} can be ${limits.done} from one internet connection. Please try again ${retry}.`
  const count = (period: number) => history.filter(post => now - post.at < period).length
  if (count(HOUR) >= limits.perHour) return cap(limits.perHour, 'an hour', 'later')
  if (count(DAY) >= limits.perDay) return cap(limits.perDay, 'a day', 'tomorrow')
  return null
}

// Drops records too old to count towards any limit
export function recentPosts<T extends PostRecord>(history: T[], now: number): T[] {
  return history.filter(post => now - post.at < DAY)
}
