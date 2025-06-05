import browserAPI from './browser-polyfill.js'
import { v4 as uuidv4 } from 'uuid'

const USER_UID_KEY = 'CTextFilterStore_strCleanPattern_1039531631'

export async function getUserUID() {
  const result = await browserAPI.storage.local.get(USER_UID_KEY)
  let uid = result[USER_UID_KEY]

  if (!uid) {
    uid = uuidv4()
    await browserAPI.storage.local.set({ [USER_UID_KEY]: uid })
  }

  return uid
}
