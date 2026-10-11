import type { PageState } from './page-state'

import { ext } from '../shared/ext'
import { pageKey } from '../shared/property'

const NEW_ISSUE_URL = 'https://github.com/zevnda/real-estate-comments/issues/new'
export const COMPLAINTS_EMAIL = 'zevnda@gmail.com'

export function complaintsMailto(): string {
  return `mailto:${COMPLAINTS_EMAIL}?subject=${encodeURIComponent('Real Estate Comments complaint')}`
}

// A link to a new GitHub issue, prefilled with a short template and the details that help reproduce a problem. The
// user sees all of it before submitting and can edit or remove anything.
export function reportIssueUrl(page: PageState): string {
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect to happen?**',
    '',
    '',
    '**Steps to reproduce**',
    '1. ',
    '',
    '---',
    `- Extension version: ${ext.runtime.getManifest().version}`,
    `- Browser: ${browserName()}`,
    `- Page: ${safePageUrl()}`,
    `- Property detected: ${describePage(page)}`,
  ].join('\n')
  return `${NEW_ISSUE_URL}?${new URLSearchParams({ body }).toString()}`
}

function describePage(page: PageState): string {
  switch (page.status) {
    case 'property':
      return `${page.property.displayAddress}, ${page.property.displayLocality} (${page.property.match} match)`
    case 'resolving':
      return 'still working it out'
    case 'unrecognised':
      return `couldn’t identify it (title: “${document.title}”)`
    case 'browse':
      return 'not a property page'
  }
}

// Without the query string or hash, which can carry search filters or tracking
function safePageUrl(): string {
  try {
    return pageKey(location.href)
  } catch {
    return location.origin
  }
}

function browserName(): string {
  const agent = navigator.userAgent
  // Edge also says "Chrome", so check it first
  const browsers: [string, RegExp][] = [
    ['Firefox', /Firefox\/(\d+)/],
    ['Edge', /Edg\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
  ]
  const found = browsers
    .map(([name, pattern]) => [name, agent.match(pattern)?.[1]] as const)
    .find(([, version]) => version)
  const platforms: [string, RegExp][] = [
    ['Windows', /Windows/],
    ['macOS', /Mac OS X/],
    ['Android', /Android/],
    ['Linux', /Linux/],
  ]
  const platform = platforms.find(([, pattern]) => pattern.test(agent))?.[0]
  const browser = found ? `${found[0]} ${found[1]}` : agent
  return platform ? `${browser} on ${platform}` : browser
}
