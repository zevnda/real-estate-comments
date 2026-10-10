import { getStored, setStored } from '../shared/storage'

export const MAX_POSTS_PER_HOUR = 5
export const MAX_POSTS_PER_PROPERTY_PER_DAY = 3

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export interface PostRecord {
  at: number
  property: string
}

// A courtesy limit to slow down accidental double posts and casual spam. It runs on the user's machine, so it isn't
// a security control; that has to be done in the Firestore rules.
export function rateLimitReason(history: PostRecord[], property: string, now: number): string | null {
  const lastHour = history.filter(post => now - post.at < HOUR)
  if (lastHour.length >= MAX_POSTS_PER_HOUR) {
    return `You can post up to ${MAX_POSTS_PER_HOUR} comments an hour. Please try again later.`
  }
  const forProperty = history.filter(post => post.property === property && now - post.at < DAY)
  if (forProperty.length >= MAX_POSTS_PER_PROPERTY_PER_DAY) {
    return `You can post up to ${MAX_POSTS_PER_PROPERTY_PER_DAY} comments a day on the same property.`
  }
  return null
}

export async function checkRateLimit(property: string): Promise<string | null> {
  return rateLimitReason((await getStored('postHistory')) ?? [], property, Date.now())
}

export async function recordPost(property: string): Promise<void> {
  const now = Date.now()
  const history = ((await getStored('postHistory')) ?? []).filter(post => now - post.at < DAY)
  history.push({ at: now, property })
  await setStored('postHistory', history)
}
