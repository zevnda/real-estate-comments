import type { PageProperty } from '../shared/property'

import { identifyProperty, isPropertyUrl, pageKey } from '../shared/property'

export type PageState =
  // A supported site, but not a property page (search results, home page, ...)
  | { status: 'browse' }
  // A property page whose address can't be confirmed yet, usually because the title hasn't updated after navigation
  | { status: 'resolving' }
  // A property page whose address couldn't be read
  | { status: 'unrecognised' }
  | { status: 'property'; property: PageProperty }

// How long a title that only partly matches the URL must stay unchanged after an in-page navigation before it's
// trusted, and how long to wait for a usable title at all.
export const SETTLE_MS = 1500
export const GIVE_UP_MS = 10_000

export interface PageSnapshot {
  url: string
  title: string
  // True until the first in-page navigation. The title is then server-rendered for this URL, so it can be trusted.
  initialLoad: boolean
  // Whether the title has changed since the URL last changed
  titleChanged: boolean
  msSinceUrlChange: number
}

export function resolvePageState(page: PageSnapshot): PageState {
  if (!isPropertyUrl(page.url)) return { status: 'browse' }
  const property = identifyProperty(page.url, page.title)
  if (property) {
    // The street address in the URL matches the title, so the title is current
    if (property.match === 'full') return { status: 'property', property }
    // Only the suburb could be checked. After in-page navigation the title may still be the previous listing in the
    // same suburb, so wait until it changes or has clearly settled.
    if (page.initialLoad || page.titleChanged || page.msSinceUrlChange >= SETTLE_MS) {
      return { status: 'property', property }
    }
  }
  return page.msSinceUrlChange >= GIVE_UP_MS ? { status: 'unrecognised' } : { status: 'resolving' }
}

export function sameState(a: PageState | null, b: PageState): boolean {
  if (!a || a.status !== b.status) return false
  if (a.status !== 'property' || b.status !== 'property') return true
  const x = a.property.input
  const y = b.property.input
  return x.url === y.url && x.address === y.address && x.suburb === y.suburb && x.postcode === y.postcode
}

// Calls `onChange` with the page's state now and whenever it changes. realestate.com.au and domain.com.au both
// navigate client-side in places, and a content script can't hook the page's history calls, so this polls the URL
// and also re-checks whenever the <title> changes. Returns a function that stops watching.
export function watchPage(onChange: (state: PageState) => void, onTick?: () => void): () => void {
  let currentKey = ''
  let urlChangedAt = 0
  let titleAtUrlChange = ''
  let initialLoad = true
  let last: PageState | null = null

  const check = () => {
    const url = location.href
    // The <title> element's raw text, not document.title, which collapses spaces (see parseAddressFromTitle)
    const title = document.head?.querySelector('title')?.textContent || document.title
    const now = Date.now()
    const key = pageKey(url)
    const urlChanged = key !== currentKey
    if (urlChanged) {
      if (currentKey) initialLoad = false
      currentKey = key
      urlChangedAt = now
      titleAtUrlChange = title
    }
    const state = resolvePageState({
      url,
      title,
      initialLoad,
      titleChanged: title !== titleAtUrlChange,
      msSinceUrlChange: now - urlChangedAt,
    })
    // Once a page's property is known, keep it until the URL changes, even if the site later edits the title
    if (!urlChanged && last?.status === 'property' && state.status !== 'property') return onTick?.()
    if (!sameState(last, state)) {
      last = state
      onChange(state)
    }
    onTick?.()
  }

  let scheduled = false
  const scheduleCheck = () => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      check()
    }, 50)
  }

  const titleObserver = new MutationObserver(mutations => {
    if (mutations.some(m => m.target.nodeName === 'TITLE' || m.target.parentNode?.nodeName === 'TITLE')) scheduleCheck()
    else if (mutations.some(m => [...m.addedNodes].some(node => node.nodeName === 'TITLE'))) scheduleCheck()
  })
  titleObserver.observe(document.head ?? document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  addEventListener('popstate', scheduleCheck)
  addEventListener('hashchange', scheduleCheck)
  const interval = setInterval(check, 500)
  check()

  return () => {
    titleObserver.disconnect()
    removeEventListener('popstate', scheduleCheck)
    removeEventListener('hashchange', scheduleCheck)
    clearInterval(interval)
  }
}
