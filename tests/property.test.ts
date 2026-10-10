import { describe, expect, it } from 'vitest'

import {
  buildPropertyKeys,
  canonicalAddress,
  getSite,
  identifyProperty,
  matchAddressToUrl,
  pageKey,
  parseAddressFromTitle,
  parsePropertyUrl,
  propertyLinks,
} from '../src/shared/property'

// The 1.x parser (src/address-parser.js before 2.0), kept here to prove comments saved by it are still found
function legacyParse(title: string, url: string) {
  if (url.includes('domain.com.au/property-profile/')) {
    const pipe = title.match(/^(.+?)\s+\|\s+/)
    if (!pipe) return null
    const parts = pipe[1]!
      .trim()
      .split(',')
      .map(part => part.trim())
    if (parts.length !== 2) return null
    return { address: parts[0]!.toLowerCase().replace(/\s+-\s+/g, '-'), suburb: parts[1]!.toLowerCase() }
  }
  if (url.includes('domain.com.au') && title.includes(' | ')) {
    const pipe = title.match(/^(.+?)\s+\|\s+/)
    if (!pipe) return null
    const parts = pipe[1]!
      .trim()
      .split(',')
      .map(part => part.trim())
    if (parts.length !== 2) return null
    const match = parts[1]!.match(/^(.+?)\s+(\w+)\s+(\d{4})/)
    if (!match) return null
    return { address: parts[0]!.toLowerCase().replace(/\s+-\s+/g, '-'), suburb: match[1]!.toLowerCase() }
  }
  const dash = title.lastIndexOf(' - ')
  if (dash === -1) return null
  const parts = title
    .substring(0, dash)
    .trim()
    .split(',')
    .map(part => part.trim())
  if (parts.length === 2) {
    const match = parts[1]!.match(/^(.+?)\s+(\w+)\s+(\d{4})$/)
    if (!match) return null
    return { address: parts[0]!.toLowerCase().replace(/\s+-\s+/g, '-'), suburb: match[1]!.toLowerCase() }
  }
  if (parts.length >= 3) {
    if (!parts[2]!.match(/^(\w+)\s+(\d{4})/)) return null
    return { address: parts[0]!.toLowerCase().replace(/\s+-\s+/g, '-'), suburb: parts[1]!.toLowerCase() }
  }
  return null
}

// Real stored comments (address, suburb, state, postcode, url) with the titles their pages would have had
const STORED = [
  {
    stored: ['65 newmarket street', 'hendra', 'qld', '4011'],
    url: 'https://www.realestate.com.au/property-house-qld-hendra-444861312',
    title: '65 Newmarket Street, Hendra, Qld 4011 - House for Sale - realestate.com.au',
  },
  {
    stored: ['15 mcintosh court', 'wynn vale', 'sa', '5127'],
    url: 'https://www.realestate.com.au/property-residential+land-sa-wynn+vale-204611380',
    title: '15 McIntosh Court, Wynn Vale, SA 5127 - Residential Land for Sale - realestate.com.au',
  },
  {
    stored: ['44a crane street', 'concord', 'nsw', '2137'],
    url: 'https://www.realestate.com.au/property-duplex+semi-detached-nsw-concord-443123148',
    title: '44A Crane Street, Concord, NSW 2137 - Duplex/Semi-detached for Sale - realestate.com.au',
  },
  {
    stored: ['97  yates ave', 'dundas valley', 'nsw', '2117'],
    url: 'https://www.realestate.com.au/property-house-nsw-dundas+valley-442858264',
    title: '97  Yates Ave, Dundas Valley, NSW 2117 - House for Rent - realestate.com.au',
  },
  {
    stored: ['6/21-25 truganini road', 'carnegie', 'vic', '3163'],
    url: 'https://www.realestate.com.au/property-apartment-vic-carnegie-423194022',
    title: '6/21-25 Truganini Road, Carnegie, Vic 3163 - Apartment for Rent - realestate.com.au',
  },
  {
    stored: ['3/42 kent street', 'epping', 'nsw', '2121'],
    url: 'https://www.domain.com.au/3-42-kent-street-epping-nsw-2121-17650798',
    title: '3/42 Kent Street, Epping NSW 2121 | Domain',
  },
  {
    stored: ['504/321 forest road', 'hurstville', 'nsw', '2220'],
    url: 'https://www.domain.com.au/504-321-forest-road-hurstville-nsw-2220-17617140',
    title: '504/321 Forest Road, Hurstville NSW 2220 | Domain',
  },
  {
    stored: ['8/814 pacific highway', 'chatswood', 'nsw', '2067'],
    url: 'https://www.domain.com.au/property-profile/8-814-pacific-highway-chatswood-nsw-2067',
    title: '8/814 Pacific Highway, Chatswood | Domain',
  },
] as const

describe('getSite', () => {
  it('matches the two sites and their subdomains only', () => {
    expect(getSite('www.realestate.com.au')).toBe('realestate')
    expect(getSite('realestate.com.au')).toBe('realestate')
    expect(getSite('www.domain.com.au')).toBe('domain')
    expect(getSite('notdomain.com.au')).toBeNull()
    expect(getSite('domain.com.au.evil.com')).toBeNull()
  })
})

describe('pageKey', () => {
  it('ignores query strings, hashes and trailing slashes', () => {
    expect(pageKey('https://www.domain.com.au/a-nsw-2000-1/?topspot=1#gallery')).toBe(
      'https://www.domain.com.au/a-nsw-2000-1',
    )
  })
})

describe('parsePropertyUrl', () => {
  it('reads realestate.com.au listing URLs, including property types with hyphens', () => {
    expect(parsePropertyUrl(STORED[2].url)).toEqual({
      site: 'realestate',
      kind: 'listing',
      state: 'nsw',
      suburbSlug: 'concord',
    })
    expect(parsePropertyUrl(STORED[1].url)).toMatchObject({ suburbSlug: 'wynn-vale', state: 'sa' })
  })

  it('reads realestate.com.au property profile URLs', () => {
    expect(parsePropertyUrl('https://www.realestate.com.au/property/12-smith-st-richmond-vic-3121/')).toEqual({
      site: 'realestate',
      kind: 'profile',
      addressSlug: '12-smith-st-richmond',
      state: 'vic',
      postcode: '3121',
    })
  })

  it('reads domain.com.au listing and profile URLs', () => {
    expect(parsePropertyUrl(STORED[5].url)).toEqual({
      site: 'domain',
      kind: 'listing',
      addressSlug: '3-42-kent-street-epping',
      state: 'nsw',
      postcode: '2121',
    })
    expect(parsePropertyUrl(STORED[7].url)).toMatchObject({ kind: 'profile', postcode: '2067' })
  })

  it('ignores pages that are not a single property', () => {
    for (const url of [
      'https://www.realestate.com.au/',
      'https://www.realestate.com.au/rent/in-richmond,+vic+3121/list-1',
      'https://www.realestate.com.au/news/some-article-12345',
      'https://www.domain.com.au/rent/richmond-vic-3121/',
      'https://www.domain.com.au/sale/?suburb=epping-nsw-2121',
      'https://www.domain.com.au/news/market-update-nsw-2000-123/',
      'https://www.google.com/property-house-vic-richmond-1234',
    ]) {
      expect(parsePropertyUrl(url), url).toBeNull()
    }
  })
})

describe('parseAddressFromTitle', () => {
  it('reads both sites’ title formats', () => {
    expect(parseAddressFromTitle(STORED[0].title)).toEqual({
      address: '65 Newmarket Street',
      suburb: 'Hendra',
      state: 'qld',
      postcode: '4011',
    })
    expect(parseAddressFromTitle(STORED[5].title)).toEqual({
      address: '3/42 Kent Street',
      suburb: 'Epping',
      state: 'nsw',
      postcode: '2121',
    })
    expect(parseAddressFromTitle(STORED[7].title)).toEqual({ address: '8/814 Pacific Highway', suburb: 'Chatswood' })
  })

  it('keeps commas that belong to the street address', () => {
    expect(parseAddressFromTitle('Unit 5, 12 Smith Street, North Richmond, VIC 3121 - Unit for Rent')).toEqual({
      address: 'Unit 5, 12 Smith Street',
      suburb: 'North Richmond',
      state: 'vic',
      postcode: '3121',
    })
  })

  it('keeps the spacing inside the address', () => {
    expect(parseAddressFromTitle(STORED[3].title)?.address).toBe('97  Yates Ave')
  })

  it('returns null for titles without an address', () => {
    expect(parseAddressFromTitle('Real Estate | Domain')).toBeNull()
    expect(parseAddressFromTitle('')).toBeNull()
  })
})

describe('canonicalAddress', () => {
  it.each([
    ['97  Yates Ave', '97 yates avenue'],
    ['97 Yates Avenue', '97 yates avenue'],
    ['Unit 5, 12 Smith St', '5/12 smith street'],
    ['Unit 5/12 Smith St', '5/12 smith street'],
    ['Apt 5 / 12 Smith St', '5/12 smith street'],
    ['6/21 - 25 Truganini Rd', '6/21-25 truganini road'],
    ['12 Smith St North', '12 smith street north'],
    ['12 St Kilda Rd', '12 st kilda road'],
    ["3 O'Connell Pde", '3 oconnell parade'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalAddress(input)).toBe(expected)
  })
})

describe('compatibility with comments saved by 1.x', () => {
  it.each(STORED)('finds the stored comment for $url', ({ stored, url, title }) => {
    const [address, suburb, state, postcode] = stored
    // Sanity check: the 1.x parser really did produce the stored key from this title
    expect(legacyParse(title, url)).toEqual({ address, suburb })

    const property = identifyProperty(url, title)
    expect(property).not.toBeNull()
    const keys = buildPropertyKeys(property!.input)
    expect(keys.addressVariants).toContain(address)
    expect(keys.suburb).toBe(suburb)
    expect(keys.state).toBe(state)
    expect(keys.postcode).toBe(postcode)
  })

  it('stays within Firestore’s 30-value limit for `in` queries', () => {
    for (const { url, title } of STORED) {
      expect(buildPropertyKeys(identifyProperty(url, title)!.input).addressVariants.length).toBeLessThanOrEqual(30)
    }
  })
})

describe('the same property on both sites', () => {
  it('gets the same key despite different spellings', () => {
    const rea = identifyProperty(
      'https://www.realestate.com.au/property-house-nsw-dundas+valley-442858264',
      '97  Yates Ave, Dundas Valley, NSW 2117 - House for Rent - realestate.com.au',
    )!
    const domain = identifyProperty(
      'https://www.domain.com.au/97-yates-avenue-dundas-valley-nsw-2117-17000000',
      '97 Yates Avenue, Dundas Valley NSW 2117 | Domain',
    )!
    expect(buildPropertyKeys(rea.input).address).toBe(buildPropertyKeys(domain.input).address)
  })
})

describe('identifyProperty', () => {
  it('fully matches when the URL contains the street address', () => {
    expect(identifyProperty(STORED[5].url, STORED[5].title)?.match).toBe('full')
    expect(identifyProperty(STORED[7].url, STORED[7].title)?.match).toBe('full')
  })

  it('partly matches realestate.com.au listings, whose URLs only have the suburb', () => {
    expect(identifyProperty(STORED[0].url, STORED[0].title)?.match).toBe('partial')
  })

  it('rejects a title for a property in another suburb (stale title after navigation)', () => {
    expect(identifyProperty(STORED[0].url, STORED[2].title)).toBeNull()
    expect(identifyProperty(STORED[5].url, STORED[6].title)).toBeNull()
  })

  it('only partly matches a stale title for another street in the same suburb', () => {
    const property = identifyProperty(
      'https://www.domain.com.au/1-other-street-epping-nsw-2121-17650799',
      '3/42 Kent Street, Epping NSW 2121 | Domain',
    )
    expect(property?.match).toBe('partial')
  })

  it('rejects listings that hide their address', () => {
    expect(
      identifyProperty(
        'https://www.realestate.com.au/property-house-qld-hendra-444861399',
        'Address available on request, Hendra, Qld 4011 - House for Sale - realestate.com.au',
      ),
    ).toBeNull()
  })

  it('formats the address for display', () => {
    expect(identifyProperty(STORED[1].url, STORED[1].title)).toMatchObject({
      displayAddress: '15 McIntosh Court',
      displayLocality: 'Wynn Vale SA 5127',
    })
  })

  it('stores the URL without query strings', () => {
    expect(identifyProperty(`${STORED[5].url}?topspot=1`, STORED[5].title)?.input.url).toBe(STORED[5].url)
  })
})

describe('matchAddressToUrl', () => {
  it('rejects a mismatched state or postcode', () => {
    const url = parsePropertyUrl(STORED[5].url)!
    expect(
      matchAddressToUrl({ address: '3/42 Kent Street', suburb: 'Epping', state: 'vic', postcode: '2121' }, url).match,
    ).toBe('none')
    expect(
      matchAddressToUrl({ address: '3/42 Kent Street', suburb: 'Epping', state: 'nsw', postcode: '3076' }, url).match,
    ).toBe('none')
  })
})

// Captured from the live sites in October 2026 (see CLAUDE.md, "Checking the live sites")
describe('live site titles', () => {
  const live = [
    {
      url: 'https://www.domain.com.au/2-5-chester-street-epping-nsw-2121-18359019',
      title: '2/5 Chester Street, Epping NSW 2121 - Apartment For Rent | Domain',
      address: '2/5 chester street',
      match: 'full',
    },
    {
      url: 'https://www.domain.com.au/15a-ryde-st-epping-nsw-2121-18355715',
      title: '15A Ryde St, Epping NSW 2121 - House For Rent | Domain',
      address: '15a ryde street',
      match: 'full',
    },
    {
      url: 'https://www.domain.com.au/17-25-29-carlingford-road-epping-nsw-2121-18347136',
      title: '17/25-29 Carlingford Road, Epping NSW 2121 - Apartment For Rent | Domain',
      address: '17/25-29 carlingford road',
      match: 'full',
    },
    {
      url: 'https://www.domain.com.au/property-profile/8-814-pacific-highway-chatswood-nsw-2067',
      title: '8/814 Pacific Highway, Chatswood | Property Value Estimate & History | Domain',
      address: '8/814 pacific highway',
      match: 'full',
    },
    {
      url: 'https://www.realestate.com.au/property-house-nsw-epping-441106232',
      title: '72 Somerset St, Epping, NSW 2121 - House for Rent - realestate.com.au',
      address: '72 somerset street',
      match: 'partial',
    },
    {
      url: 'https://www.realestate.com.au/property/72-somerset-st-epping-nsw-2121/',
      title: '72 Somerset Street, Epping, NSW 2121 - realestate.com.au',
      address: '72 somerset street',
      match: 'full',
    },
  ] as const

  it.each(live)('identifies $url', ({ url, title, address, match }) => {
    const property = identifyProperty(url, title)
    expect(property?.match).toBe(match)
    expect(buildPropertyKeys(property!.input).address).toBe(address)
  })

  it('shows the address as the site wrote it', () => {
    expect(identifyProperty(live[1].url, live[1].title)?.displayAddress).toBe('15A Ryde St')
  })

  it('rejects stale search-page titles, which mention the suburb but have no street address', () => {
    const url = 'https://www.realestate.com.au/property-house-nsw-epping-441106232'
    expect(
      identifyProperty(url, 'Rental Properties and Real Estate in Epping, NSW 2121 - realestate.com.au'),
    ).toBeNull()
    expect(identifyProperty(live[0].url, '310 Rental Properties in Epping, NSW, 2121 | Domain')).toBeNull()
  })

  it('rejects off-market realestate.com.au listings, which keep the URL but get a generic title', () => {
    expect(identifyProperty(live[4].url, 'Real Estate, Property & Homes For Sale - realestate.com.au')).toBeNull()
  })
})

// Every page for the same property, on both sites, must produce the same key, or comments left on one page won't
// show on the others. Real URLs and titles captured from the live sites in October 2026.
describe('one property, every page', () => {
  const PROPERTIES = {
    '46 Stanley Road, Epping (house)': [
      // realestate.com.au sold listing (the for-sale listing's page was deleted when it sold)
      [
        'https://www.realestate.com.au/sold/property-house-nsw-epping-152308708',
        '46 Stanley Road, Epping, NSW 2121 - Property Details',
      ],
      // realestate.com.au property profile (note "rd" in the URL)
      [
        'https://www.realestate.com.au/property/46-stanley-rd-epping-nsw-2121/',
        '46 Stanley Road, Epping, NSW 2121 - realestate.com.au',
      ],
      // domain.com.au sold listing
      [
        'https://www.domain.com.au/46-stanley-road-epping-nsw-2121-2021146795',
        'Sold 46 Stanley Road, Epping NSW 2121 on 10 Oct 2026 - 2021146795 | Domain',
      ],
      // domain.com.au property profile
      [
        'https://www.domain.com.au/property-profile/46-stanley-road-epping-nsw-2121',
        '46 Stanley Road, Epping | Property Value Estimate & History | Domain',
      ],
    ],
    '41/10-14 Hazlewood Place, Epping (apartment)': [
      [
        'https://www.realestate.com.au/sold/property-apartment-nsw-epping-152084664',
        '41/10-14 Hazlewood Place, Epping, NSW 2121 - Property Details',
      ],
      [
        'https://www.realestate.com.au/property/unit-41-10-14-hazlewood-pl-epping-nsw-2121/',
        '41/10-14 Hazlewood Place, Epping, NSW 2121 - realestate.com.au',
      ],
      [
        'https://www.domain.com.au/41-10-14-hazlewood-place-epping-nsw-2121-2021082874',
        'Sold 41/10-14 Hazlewood Place, Epping NSW 2121 on 07 Oct 2026 - 2021082874 | Domain',
      ],
      [
        'https://www.domain.com.au/property-profile/41-10-14-hazlewood-place-epping-nsw-2121',
        '41/10-14 Hazlewood Place, Epping | Property Value Estimate & History | Domain',
      ],
    ],
    '72 Somerset Street, Epping (rental)': [
      [
        'https://www.realestate.com.au/property-house-nsw-epping-441106232',
        '72 Somerset St, Epping, NSW 2121 - House for Rent - realestate.com.au',
      ],
      [
        'https://www.realestate.com.au/property/72-somerset-st-epping-nsw-2121/',
        '72 Somerset Street, Epping, NSW 2121 - realestate.com.au',
      ],
    ],
    '242-244 Beecroft Road, Epping (building)': [
      [
        'https://www.realestate.com.au/property-apartment-nsw-epping-148663868',
        '242-244 Beecroft Road, Epping, NSW 2121 - Apartment for Sale - realestate.com.au',
      ],
      [
        'https://www.domain.com.au/242-244-beecroft-road-epping-nsw-2121-2020166581',
        '242-244 Beecroft Road, Epping NSW 2121 | Domain',
      ],
    ],
  } as const

  describe.each(Object.entries(PROPERTIES))('%s', (_, pages) => {
    const keys = pages.map(([url, title]) => {
      const property = identifyProperty(url, title)
      expect(property, url).not.toBeNull()
      return buildPropertyKeys(property!.input)
    })

    it('is identified on every page', () => {
      expect(keys).toHaveLength(pages.length)
    })

    it('saves comments under the same key on every page', () => {
      const saved = keys.map(({ address, suburb, state, postcode }) => ({ address, suburb, state, postcode }))
      for (const key of saved) expect(key).toEqual(saved[0])
    })

    it('finds comments saved on any of its pages', () => {
      for (const reader of keys) for (const writer of keys) expect(reader.addressVariants).toContain(writer.address)
    })
  })

  it('also finds comments 1.x saved on domain.com.au sold pages, under "sold …"', () => {
    const [url, title] = PROPERTIES['46 Stanley Road, Epping (house)'][2]
    expect(buildPropertyKeys(identifyProperty(url, title)!.input).addressVariants).toContain('sold 46 stanley road')
  })

  it('fully matches realestate.com.au unit profile URLs', () => {
    const [url, title] = PROPERTIES['41/10-14 Hazlewood Place, Epping (apartment)'][1]
    expect(identifyProperty(url, title)?.match).toBe('full')
  })

  it('trims unexpected words before the address when the URL shows where it starts', () => {
    const property = identifyProperty(
      'https://www.domain.com.au/46-stanley-road-epping-nsw-2121-2021146795',
      'Price guide 46 Stanley Road, Epping NSW 2121 | Domain',
    )
    expect(property).toMatchObject({ match: 'full', displayAddress: '46 Stanley Road' })
  })
})

describe('propertyLinks', () => {
  // Profile URLs seen on the live sites
  it.each([
    [
      { address: '46 stanley road', suburb: 'epping', state: 'nsw', postcode: '2121' },
      'https://www.realestate.com.au/property/46-stanley-rd-epping-nsw-2121/',
      'https://www.domain.com.au/property-profile/46-stanley-road-epping-nsw-2121',
    ],
    [
      { address: '41/10-14 hazlewood place', suburb: 'epping', state: 'nsw', postcode: '2121' },
      'https://www.realestate.com.au/property/unit-41-10-14-hazlewood-pl-epping-nsw-2121/',
      'https://www.domain.com.au/property-profile/41-10-14-hazlewood-place-epping-nsw-2121',
    ],
    [
      { address: '8/814 pacific highway', suburb: 'chatswood', state: 'nsw', postcode: '2067' },
      'https://www.realestate.com.au/property/unit-8-814-pacific-hwy-chatswood-nsw-2067/',
      'https://www.domain.com.au/property-profile/8-814-pacific-highway-chatswood-nsw-2067',
    ],
    [
      // A 1.x key with irregular spacing and an abbreviation
      { address: '97  yates ave', suburb: 'dundas valley', state: 'nsw', postcode: '2117' },
      'https://www.realestate.com.au/property/97-yates-ave-dundas-valley-nsw-2117/',
      'https://www.domain.com.au/property-profile/97-yates-avenue-dundas-valley-nsw-2117',
    ],
  ])('%o', (key, realestate, domain) => {
    expect(propertyLinks(key)).toMatchObject({ realestate, domain })
  })

  it('includes a web search for the address', () => {
    const links = propertyLinks({ address: '35 churchill crescent', suburb: 'concord', state: 'nsw', postcode: '2137' })
    expect(links.realestate).toBe('https://www.realestate.com.au/property/35-churchill-cres-concord-nsw-2137/')
    expect(decodeURIComponent(links.search)).toBe(
      'https://www.google.com/search?q=35 Churchill Crescent, Concord NSW 2137',
    )
  })
})
