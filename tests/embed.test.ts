import { describe, expect, it } from 'vitest'

import { EMBED_OFF, embedEnabled, embedProperty, embedSiteFor, parseEmbedConfig } from '../src/shared/embed'

const PAGE = 'https://www.dropbee.au/p/11-260-casuarina-drive-nightcliff-nt-0810-00000000-0000-4000-8000-000000000000'

const params = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    url: PAGE,
    address: '11/260 Casuarina Drive',
    suburb: 'Nightcliff',
    state: 'NT',
    postcode: '0810',
    ...overrides,
  })

describe('embedProperty', () => {
  it('identifies the property from the partner page’s URL and address, with the extension’s keys', () => {
    const property = embedProperty(params())
    expect(property).toMatchObject({
      site: 'dropbee',
      match: 'full',
      displayAddress: '11/260 Casuarina Drive',
      displayLocality: 'Nightcliff NT 0810',
    })
    expect(property?.input).toEqual({
      address: '11/260 Casuarina Drive',
      suburb: 'Nightcliff',
      state: 'nt',
      postcode: '0810',
      url: PAGE,
    })
  })

  it('handles a street that shares its suburb’s name', () => {
    const url = 'https://www.dropbee.au/p/36-gunn-crescent-gunn-nt-0832-00000000-0000-4000-8000-000000000000'
    expect(
      embedProperty(params({ url, address: '36 Gunn Crescent', suburb: 'Gunn', postcode: '0832' }))?.input.address,
    ).toBe('36 Gunn Crescent')
  })

  it('refuses an address that doesn’t match the page, so comments can’t go to the wrong property', () => {
    expect(embedProperty(params({ address: '12/260 Casuarina Drive' }))).toBeNull()
    expect(embedProperty(params({ suburb: 'Rapid Creek' }))).toBeNull()
    expect(embedProperty(params({ postcode: '0812' }))).toBeNull()
    expect(embedProperty(params({ state: 'NSW' }))).toBeNull()
  })

  it('only works for partner sites’ property pages, over HTTPS', () => {
    expect(
      embedProperty(
        params({ url: 'https://www.domain.com.au/property-profile/11-260-casuarina-drive-nightcliff-nt-0810' }),
      ),
    ).toBeNull()
    expect(embedProperty(params({ url: PAGE.replace('https:', 'http:') }))).toBeNull()
    expect(embedProperty(params({ url: 'https://www.dropbee.au/nt/nightcliff-0810' }))).toBeNull()
  })

  it('needs every field', () => {
    for (const key of ['url', 'address', 'suburb', 'state', 'postcode']) {
      const missing = params()
      missing.delete(key)
      expect(embedProperty(missing), key).toBeNull()
    }
    expect(embedProperty(params({ address: 'x'.repeat(301) }))).toBeNull()
  })
})

describe('embedSiteFor', () => {
  it('finds the partner site of a page', () => {
    expect(embedSiteFor(PAGE)?.name).toBe('dropbee.au')
    expect(embedSiteFor('https://dropbee.au/p/x')?.site).toBe('dropbee')
    expect(embedSiteFor('https://www.realestate.com.au/property/1-a-st-b-nsw-2000/')).toBeNull()
    expect(embedSiteFor('not a url')).toBeNull()
  })
})

describe('the on/off switch', () => {
  it('is off without a config document', () => {
    expect(parseEmbedConfig(null)).toEqual(EMBED_OFF)
    expect(embedEnabled(parseEmbedConfig(undefined), 'dropbee')).toBe(false)
  })

  it('needs both the switch for every site and the site’s own', () => {
    expect(embedEnabled(parseEmbedConfig({ enabled: true, sites: { dropbee: true } }), 'dropbee')).toBe(true)
    expect(embedEnabled(parseEmbedConfig({ enabled: false, sites: { dropbee: true } }), 'dropbee')).toBe(false)
    expect(embedEnabled(parseEmbedConfig({ enabled: true, sites: { dropbee: false } }), 'dropbee')).toBe(false)
    expect(embedEnabled(parseEmbedConfig({ enabled: true, sites: {} }), 'dropbee')).toBe(false)
  })

  it('ignores sites that aren’t partners, and values that aren’t true', () => {
    expect(embedEnabled(parseEmbedConfig({ enabled: true, sites: { domain: true } }), 'domain')).toBe(false)
    expect(parseEmbedConfig({ enabled: 'yes', sites: { dropbee: 1 } })).toEqual(EMBED_OFF)
  })
})
