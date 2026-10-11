import type { BackgroundApi, BackgroundRequest, ContentMessage, Result } from '../shared/messages'
import type { Area } from '../shared/property'

import { FirebaseError } from 'firebase/app'

import { ext } from '../shared/ext'
import { log } from '../shared/log'
import { buildPropertyKeys, getSite, STATES } from '../shared/property'
import { isReportReason, REPORT_DETAILS_MAX_LENGTH } from '../shared/reports'
import { SITE_MATCHES } from '../shared/sites'
import { setStored } from '../shared/storage'
import { isPropertyInput, validateCommentText } from '../shared/validation'
import {
  areaStats,
  createComment,
  deleteComment,
  editComment,
  listComments,
  recentComments,
  reportComment,
  searchComments,
  toggleVote,
  UserError,
} from './comments'
import { getUserId } from './identity'
import { checkRateLimit, recordPost } from './rate-limit'

// The background script owns all Firestore access, so there's one signed-in session and the page can't interfere
// with it. Listeners are registered synchronously at the top level, as MV3 service workers require.

type Handlers = {
  [K in keyof BackgroundApi]: (
    request: Extract<BackgroundRequest, { type: K }>,
    sender: chrome.runtime.MessageSender,
  ) => Promise<BackgroundApi[K]['response']>
}

const handlers: Handlers = {
  async listComments({ property, fresh }) {
    if (!isPropertyInput(property)) throw new UserError('Couldn’t read this property’s address.')
    return listComments(property, await getUserId(), fresh === true)
  },

  async recentComments({ fresh }) {
    return recentComments(await getUserId(), fresh === true)
  },

  async createComment({ property, text, username, replyTo }) {
    if (!isPropertyInput(property)) throw new UserError('Couldn’t read this property’s address.')
    if (typeof text !== 'string' || typeof username !== 'string') throw new UserError('Invalid comment.')
    if (replyTo !== undefined && !isCommentId(replyTo)) throw new UserError('Invalid reply.')
    const invalid = validateCommentText(text)
    if (invalid) throw new UserError(invalid)

    const propertyKey = buildPropertyKeys(property)
    const rateKey = `${propertyKey.address}|${propertyKey.suburb}|${propertyKey.postcode}`
    const reply = replyTo !== undefined
    const limited = await checkRateLimit(rateKey, reply)
    if (limited) throw new UserError(limited)

    const comment = await createComment(property, text, username, await getUserId(), replyTo)
    await recordPost(rateKey, reply)
    return comment
  },

  async editComment({ commentId, text }) {
    if (!isCommentId(commentId) || typeof text !== 'string') throw new UserError('Invalid comment.')
    const invalid = validateCommentText(text)
    if (invalid) throw new UserError(invalid)
    return editComment(commentId, text, await getUserId())
  },

  async toggleVote({ commentId }) {
    if (!isCommentId(commentId)) throw new UserError('Invalid comment.')
    return toggleVote(commentId, await getUserId())
  },

  async deleteComment({ commentId }) {
    if (!isCommentId(commentId)) throw new UserError('Invalid comment.')
    await deleteComment(commentId, await getUserId())
    return null
  },

  async reportComment({ commentId, reason, details }) {
    if (!isCommentId(commentId)) throw new UserError('Invalid comment.')
    if (!isReportReason(reason)) throw new UserError('Choose why you’re reporting this comment.')
    if (typeof details !== 'string' || details.trim().length > REPORT_DETAILS_MAX_LENGTH) {
      throw new UserError(`Details can’t be longer than ${REPORT_DETAILS_MAX_LENGTH} characters.`)
    }
    await reportComment(commentId, reason, details.trim())
    return null
  },

  async areaStats({ area }) {
    if (!isArea(area)) throw new UserError('Invalid suburb.')
    return areaStats(area)
  },

  async searchComments({ query }) {
    if (typeof query !== 'string' || query.length > 200) throw new UserError('Invalid search.')
    return searchComments(query, await getUserId())
  },

  async setBadge({ count }, sender) {
    const tabId = sender.tab?.id
    if (tabId === undefined) return null
    const text = typeof count === 'number' && count > 0 ? (count > 99 ? '99+' : String(count)) : ''
    await ext.action.setBadgeText({ tabId, text })
    return null
  },
}

ext.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
  // Only our own content scripts talk to the background script
  if (sender.id !== ext.runtime.id || !message || typeof message.type !== 'string' || !(message.type in handlers)) {
    return false
  }
  const handler = handlers[message.type] as (
    request: BackgroundRequest,
    sender: chrome.runtime.MessageSender,
  ) => Promise<unknown>
  handler(message, sender).then(
    data => sendResponse({ ok: true, data } satisfies Result<unknown>),
    (error: unknown) => {
      log.error(`${message.type} failed:`, error)
      sendResponse({ ok: false, error: userMessage(error) } satisfies Result<unknown>)
    },
  )
  // Keeps the channel open for the async response. Chrome doesn't accept a returned promise here.
  return true
})

// Whether the user has let the extension run on the two sites. Firefox lets users switch Manifest V3 site access off
// (and Chrome has "on click" access); without it the content script never runs and the extension silently does
// nothing. Null until checked, e.g. just after the background has started.
let siteAccess: boolean | null = null
const checkSiteAccess = () =>
  ext.permissions.contains({ origins: SITE_MATCHES }).then(
    granted => (siteAccess = granted),
    () => {},
  )
void checkSiteAccess()
ext.permissions.onAdded.addListener(() => void checkSiteAccess())
ext.permissions.onRemoved.addListener(() => void checkSiteAccess())

// The toolbar button (and its keyboard shortcut) opens or closes the panel on supported sites. Without site access, it
// asks for it first.
ext.action.onClicked.addListener(tab => {
  if (tab.id === undefined) return
  const tabId = tab.id
  if (siteAccess === true) return togglePanel(tabId)
  // Asked for straight away, still inside the click: Firefox only allows the prompt from a user action. If access is
  // already granted (siteAccess just wasn't known yet), this resolves without a prompt.
  ext.permissions.request({ origins: SITE_MATCHES }).then(
    granted => {
      siteAccess = granted
      if (granted) void startOnTab(tabId)
    },
    (error: unknown) => log.warn('Requesting site access failed:', error),
  )
})

function togglePanel(tabId: number) {
  const message: ContentMessage = { type: 'togglePanel' }
  ext.tabs.sendMessage(tabId, message).catch(() => {
    // No content script in this tab: it isn't realestate.com.au or domain.com.au
  })
}

// Just granted access: open the panel, or, if the page loaded before access was granted (so the content script isn't
// there), reload it with the panel set to open
async function startOnTab(tabId: number) {
  const message: ContentMessage = { type: 'togglePanel' }
  try {
    await ext.tabs.sendMessage(tabId, message)
  } catch {
    const tab = await ext.tabs.get(tabId)
    if (!tab.url || !isSupportedSite(tab.url)) return
    await setStored('panelOpen', true)
    await ext.tabs.reload(tabId)
  }
}

function isSupportedSite(url: string): boolean {
  try {
    return getSite(new URL(url).hostname) !== null
  } catch {
    return false
  }
}

// Clear a tab's comment count when it starts loading another page. The content script sets it again if the new page
// is a property.
ext.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') ext.action.setBadgeText({ tabId, text: '' }).catch(() => {})
})

ext.runtime.onInstalled.addListener(() => {
  ext.action.setBadgeBackgroundColor({ color: '#2563eb' }).catch(() => {})
})

function isArea(value: unknown): value is Area {
  if (!value || typeof value !== 'object') return false
  const { suburb, state, postcode } = value as Record<string, unknown>
  return (
    typeof suburb === 'string' &&
    /^[a-z][a-z' -]{0,60}$/.test(suburb) &&
    typeof state === 'string' &&
    (STATES as readonly string[]).includes(state) &&
    typeof postcode === 'string' &&
    /^\d{4}$/.test(postcode)
  )
}

function isCommentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value)
}

function userMessage(error: unknown): string {
  if (error instanceof UserError) return error.message
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'unavailable':
      case 'deadline-exceeded':
      case 'auth/network-request-failed':
        return 'Couldn’t reach the comments server. Check your connection and try again.'
      case 'permission-denied':
        return 'The comments server refused this request.'
      case 'resource-exhausted':
      case 'auth/too-many-requests':
        return 'The comments server is busy. Please try again in a few minutes.'
    }
  }
  return 'Something went wrong. Please try again.'
}
