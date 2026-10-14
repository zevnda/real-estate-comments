import { describe, expect, it } from 'vitest'

import { optionalSiteFor } from '../src/background/sites'
import { createManifest } from '../src/manifest'
import { getSite } from '../src/shared/property'
import { OPTIONAL_SITE_MATCHES, OPTIONAL_SITES, REQUIRED_SITE_MATCHES, SITE_MATCHES } from '../src/shared/sites'

// Adding a required site makes Chrome switch the extension off for existing users until they accept it, so only
// realestate.com.au and domain.com.au may ever be required (see CLAUDE.md, "Permissions")
describe('required and optional sites', () => {
  it('only requires realestate.com.au and domain.com.au', () => {
    expect(REQUIRED_SITE_MATCHES.map(match => getSite(new URL(match.replace('*', '')).hostname))).toEqual([
      'realestate',
      'realestate',
      'domain',
      'domain',
    ])
  })

  it.each(['chrome', 'firefox'] as const)(
    'keeps optional sites out of the required parts of the %s manifest',
    browser => {
      const manifest = createManifest(browser, '1.0.0') as {
        host_permissions: string[]
        optional_host_permissions: string[]
        content_scripts: { matches: string[] }[]
        description: string
      }
      expect(manifest.host_permissions).toEqual(REQUIRED_SITE_MATCHES)
      expect(manifest.optional_host_permissions).toEqual(OPTIONAL_SITE_MATCHES)
      expect(manifest.content_scripts.flatMap(script => script.matches)).toEqual(REQUIRED_SITE_MATCHES)
      // The Chrome Web Store's limit
      expect(manifest.description.length).toBeLessThanOrEqual(132)
    },
  )

  it('lists every site the extension can run on', () => {
    expect(SITE_MATCHES).toEqual([...REQUIRED_SITE_MATCHES, ...OPTIONAL_SITE_MATCHES])
    for (const site of OPTIONAL_SITES) {
      for (const match of site.matches) expect(getSite(new URL(match.replace('*', '')).hostname)).toBe(site.site)
    }
  })
})

describe('optionalSiteFor', () => {
  it('finds the optional site a page is on', () => {
    expect(
      optionalSiteFor('https://www.homely.com.au/homes/1-great-central-road-warburton-wa-6431/7664071')?.site,
    ).toBe('homely')
    expect(optionalSiteFor('https://homely.com.au/')?.site).toBe('homely')
  })

  it('ignores required sites, other sites and missing URLs', () => {
    expect(optionalSiteFor('https://www.realestate.com.au/property-house-nsw-epping-441106232')).toBeNull()
    expect(optionalSiteFor('https://www.domain.com.au/')).toBeNull()
    expect(optionalSiteFor('https://homely.com.au.evil.com/')).toBeNull()
    expect(optionalSiteFor('not a url')).toBeNull()
    expect(optionalSiteFor(undefined)).toBeNull()
  })
})
