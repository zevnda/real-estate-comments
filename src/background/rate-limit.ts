import { getStored, setStored } from '../shared/storage'

export const MAX_POSTS_PER_HOUR = 5
export const MAX_POSTS_PER_PROPERTY_PER_DAY = 3

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export interface PostRecord {
  at: number
  property: string
  // Replies count towards the hourly limit, but not the per-property one, so a conversation isn't cut off
  reply?: boolean
}

// A courtesy limit to slow down accidental double posts and casual spam. It runs on the user's machine, so it isn't
// a security control; that has to be done in the Firestore rules.
export function rateLimitReason(history: PostRecord[], property: string, now: number, reply = false): string | null {
  const lastHour = history.filter(post => now - post.at < HOUR)
  if (lastHour.length >= MAX_POSTS_PER_HOUR) {
    return `You can post up to ${MAX_POSTS_PER_HOUR} comments an hour. Please try again later.`
  }
  if (reply) return null
  const forProperty = history.filter(post => post.property === property && !post.reply && now - post.at < DAY)
  if (forProperty.length >= MAX_POSTS_PER_PROPERTY_PER_DAY) {
    return `You can post up to ${MAX_POSTS_PER_PROPERTY_PER_DAY} comments a day on the same property.`
  }
  return null
}

export async function checkRateLimit(property: string, reply: boolean): Promise<string | null> {
  return rateLimitReason((await getStored('postHistory')) ?? [], property, Date.now(), reply)
}

export async function recordPost(property: string, reply: boolean): Promise<void> {
  const now = Date.now()
  const history = ((await getStored('postHistory')) ?? []).filter(post => now - post.at < DAY)
  history.push(reply ? { at: now, property, reply } : { at: now, property })
  await setStored('postHistory', history)
}
