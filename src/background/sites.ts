import type { SiteInfo } from '../shared/sites'

import { ext } from '../shared/ext'
import { log } from '../shared/log'
import { getSite } from '../shared/property'
import { OPTIONAL_SITES } from '../shared/sites'

// Optional sites (see shared/sites.ts) can't be in the manifest's content_scripts, since Chrome counts those as
// required sites. So the content script is registered here for the ones the user has turned on, and kept in step as
// they turn them on or off (from the toolbar button, the Sites page, or the browser's own extension settings).

const SCRIPT_ID = 'optional-sites'

// The optional site a page is on, if any
export function optionalSiteFor(url: string | undefined): SiteInfo | null {
  if (!url) return null
  try {
    const site = getSite(new URL(url).hostname)
    return OPTIONAL_SITES.find(optional => optional.site === site) ?? null
  } catch {
    return null
  }
}

async function grantedMatches(): Promise<string[]> {
  const granted = await Promise.all(OPTIONAL_SITES.map(site => ext.permissions.contains({ origins: site.matches })))
  return OPTIONAL_SITES.filter((_, i) => granted[i]).flatMap(site => site.matches)
}

// Registers the content script for exactly the optional sites that are turned on. With `injectOpenTabs` (just turned
// on), also starts it in tabs already open on a newly turned-on site, so they don't need refreshing. Not on startup:
// a tab that already has the script would get a second copy.
async function sync(injectOpenTabs: boolean): Promise<void> {
  const matches = await grantedMatches()
  const [registered] = await ext.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
  const current = registered?.matches ?? []
  if (current.length === matches.length && matches.every(match => current.includes(match))) return

  if (registered) await ext.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
  if (matches.length) {
    await ext.scripting.registerContentScripts([{ id: SCRIPT_ID, matches, js: ['content.js'], runAt: 'document_idle' }])
  }

  const added = matches.filter(match => !current.includes(match))
  if (!injectOpenTabs || !added.length) return
  const tabs = await ext.tabs.query({ url: added })
  const tabIds = tabs.flatMap(tab => (tab.id === undefined ? [] : [tab.id]))
  await Promise.all(
    tabIds.map(tabId =>
      ext.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).then(
        () => {},
        () => {},
      ),
    ),
  )
}

// One at a time, so a grant from the toolbar button and the permissions event it causes can't race
let queue: Promise<void> = Promise.resolve()
export function syncOptionalSites(injectOpenTabs = false): Promise<void> {
  queue = queue.then(
    () => sync(injectOpenTabs),
    () => sync(injectOpenTabs),
  )
  return queue.catch(error => log.warn('Updating optional sites failed:', error))
}
