import { getStored, setStored } from '../shared/storage'

const USER_ID_KEY = 'CTextFilterStore_strCleanPattern_1039531631'

let cached: Promise<string> | null = null

// The anonymous ID stored on each comment (`uid`) and used for ownership and votes. It's separate from the Firebase
// Auth UID, and must stay stable: it's how users keep the ability to delete their old comments.
export function getUserId(): Promise<string> {
  cached ??= (async () => {
    const existing = await getStored(USER_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    await setStored(USER_ID_KEY, id)
    return id
  })().catch(error => {
    cached = null
    throw error
  })
  return cached
}
