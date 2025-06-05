import { getBrowserAPI } from './utils/utils.js'
import { v4 as uuidv4 } from 'uuid'

const USER_UID_KEY = 'CTextFilterStore_strCleanPattern_1039531631'

export async function getUserUID() {
  const browserAPI = getBrowserAPI()

  let result
  if (typeof browser !== 'undefined' && browser.storage) {
    // Firefox
    result = await browserAPI.storage.local.get(USER_UID_KEY)
  } else {
    // Chrome
    result = await new Promise(resolve => {
      browserAPI.storage.local.get(USER_UID_KEY, resolve)
    })
  }

  let uid = result[USER_UID_KEY]

  if (!uid) {
    uid = uuidv4()
    if (typeof browser !== 'undefined' && browser.storage) {
      // Firefox
      await browserAPI.storage.local.set({ [USER_UID_KEY]: uid })
    } else {
      // Chrome
      await new Promise(resolve => {
        browserAPI.storage.local.set({ [USER_UID_KEY]: uid }, resolve)
      })
    }
  }

  return uid
}
