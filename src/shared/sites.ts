import type { Site } from './property.ts'

// The sites the extension runs on (see CLAUDE.md, "Site access").
//
// Required sites are in the manifest's host_permissions and content_scripts, so they're granted on install. Every other
// site is optional (optional_host_permissions): adding a required site makes Chrome switch the extension off for
// existing users until they accept it, so new sites are only ever optional, turned on by the user from the toolbar
// button on one of its pages or the Sites page. The background registers the content script for the ones turned on.

export interface SiteInfo {
  site: Site
  // How the site is named to users
  name: string
  matches: string[]
}

export const REQUIRED_SITES: SiteInfo[] = [
  {
    site: 'realestate',
    name: 'realestate.com.au',
    matches: ['https://www.realestate.com.au/*', 'https://realestate.com.au/*'],
  },
  { site: 'domain', name: 'domain.com.au', matches: ['https://www.domain.com.au/*', 'https://domain.com.au/*'] },
]

export const OPTIONAL_SITES: SiteInfo[] = [
  { site: 'homely', name: 'homely.com.au', matches: ['https://www.homely.com.au/*', 'https://homely.com.au/*'] },
]

export const REQUIRED_SITE_MATCHES = REQUIRED_SITES.flatMap(site => site.matches)
export const OPTIONAL_SITE_MATCHES = OPTIONAL_SITES.flatMap(site => site.matches)
// Every site the extension can run on (e.g. the pages allowed to frame the comment relay's challenge page)
export const SITE_MATCHES = [...REQUIRED_SITE_MATCHES, ...OPTIONAL_SITE_MATCHES]
