import { describe, expect, it } from 'vitest'

import { GIVE_UP_MS, resolvePageState, SETTLE_MS } from '../src/content/page-state'

const REA_URL = 'https://www.realestate.com.au/property-house-nsw-concord-434909539'
const REA_TITLE = '9 Warbrick Street, Concord, NSW 2137 - House for Sale - realestate.com.au'
const REA_OTHER_TITLE = '35 Churchill Crescent, Concord, NSW 2137 - House for Sale - realestate.com.au'
const DOMAIN_URL = 'https://www.domain.com.au/3-42-kent-street-epping-nsw-2121-17650798'
const DOMAIN_TITLE = '3/42 Kent Street, Epping NSW 2121 | Domain'

const base = { initialLoad: false, titleChanged: false, msSinceUrlChange: 0 }

describe('resolvePageState', () => {
  it('is "browse" off property pages', () => {
    expect(resolvePageState({ ...base, url: 'https://www.domain.com.au/rent/', title: 'Rent' }).status).toBe('browse')
  })

  it('trusts the title on the first page load', () => {
    expect(resolvePageState({ ...base, initialLoad: true, url: REA_URL, title: REA_TITLE }).status).toBe('property')
  })

  it('trusts a fully matching title immediately after navigation', () => {
    expect(resolvePageState({ ...base, url: DOMAIN_URL, title: DOMAIN_TITLE }).status).toBe('property')
  })

  it('waits when the URL changed but a same-suburb title has not (possibly stale)', () => {
    expect(resolvePageState({ ...base, url: REA_URL, title: REA_OTHER_TITLE }).status).toBe('resolving')
  })

  it('accepts a partly matching title once it has changed or settled', () => {
    expect(resolvePageState({ ...base, titleChanged: true, url: REA_URL, title: REA_TITLE }).status).toBe('property')
    expect(resolvePageState({ ...base, msSinceUrlChange: SETTLE_MS, url: REA_URL, title: REA_TITLE }).status).toBe(
      'property',
    )
  })

  it('gives up on titles that never match', () => {
    const title = 'Something else entirely'
    expect(resolvePageState({ ...base, url: REA_URL, title }).status).toBe('resolving')
    expect(resolvePageState({ ...base, msSinceUrlChange: GIVE_UP_MS, url: REA_URL, title }).status).toBe('unrecognised')
  })
})
