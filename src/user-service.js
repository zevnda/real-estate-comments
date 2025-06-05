import { v4 as uuidv4 } from 'uuid'

const USER_UID_KEY = 'CTextFilterStore_strCleanPattern_1039531631'

export function getUserUID() {
  let uid = localStorage.getItem(USER_UID_KEY)

  if (!uid) {
    uid = uuidv4()
    localStorage.setItem(USER_UID_KEY, uid)
  }

  return uid
}
