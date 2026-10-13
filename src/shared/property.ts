// Identifies which property a page is about, and builds the keys comments are stored under.
//
// Comments live in Firestore keyed by a lowercased street `address` plus `suburb` (see CLAUDE.md, "Data model").
// The same house must map to the same key on realestate.com.au, domain.com.au and homely.com.au, on listing and
// profile pages, and
// across re-listings, so the key comes from the address text rather than any site's listing ID.
//
// Everything here is pure (no DOM or extension APIs) so it can be unit tested and shared by both scripts.

export type Site = 'realestate' | 'domain' | 'homely'
export type PageKind = 'listing' | 'profile'

export const STATES = ['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'] as const
const STATE_PATTERN = STATES.join('|')

// What a property page's URL tells us. Listing URLs on realestate.com.au only carry the suburb and state; the other
// formats carry the full address as a slug.
export interface PropertyUrl {
  site: Site
  kind: PageKind
  state: string
  postcode?: string
  // Suburb slug, when the URL has it separately (realestate.com.au listings), e.g. "wynn-vale"
  suburbSlug?: string
  // Address and suburb slug, when the URL has it (everything else), e.g. "3-42-kent-street-epping"
  addressSlug?: string
}

// The property details sent from the content script to the background script.
export interface PropertyInput {
  // Street address as written on the page, e.g. "3/42 Kent Street"
  address: string
  // The address part of the title before prefixes like "Sold" were removed, when different. 1.x saved comments on
  // those pages under it ("sold 46 stanley road"), so it's looked up too.
  titleAddress?: string
  suburb: string
  state: string
  postcode: string
  url: string
}

// The Firestore keys for a property.
export interface PropertyKeys {
  // The address new comments are saved under
  address: string
  // Every address form to look up, oldest formats included, so comments saved by earlier versions are still found
  addressVariants: string[]
  suburb: string
  state: string
  postcode: string
}

export function getSite(hostname: string): Site | null {
  const host = hostname.toLowerCase()
  if (host === 'realestate.com.au' || host.endsWith('.realestate.com.au')) return 'realestate'
  if (host === 'domain.com.au' || host.endsWith('.domain.com.au')) return 'domain'
  if (host === 'homely.com.au' || host.endsWith('.homely.com.au')) return 'homely'
  return null
}

// The part of a URL that identifies the page. Query strings and hashes change as users open galleries or maps, and
// must not count as navigating to a different property.
export function pageKey(url: string): string {
  const { origin, pathname } = new URL(url)
  return origin + pathname.replace(/\/+$/, '')
}

export function parsePropertyUrl(url: string): PropertyUrl | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const site = getSite(parsed.hostname)
  if (!site) return null
  const path = safeDecode(parsed.pathname).toLowerCase().replace(/\/+$/, '')

  if (site === 'realestate') {
    // Listing: /property-house-qld-hendra-444861312, /property-duplex+semi-detached-nsw-concord-443123148
    // Sold listings: /sold/property-house-nsw-epping-152308708 (a new ID; the for-sale listing's page is deleted)
    const listing = path.match(new RegExp(`^/(?:sold/|leased/)?property-.+-(${STATE_PATTERN})-([a-z0-9+' -]+)-(\\d+)$`))
    if (listing) {
      return { site, kind: 'listing', state: listing[1]!, suburbSlug: slugify(listing[2]!.replace(/\+/g, ' ')) }
    }
    // Property profile: /property/46-stanley-rd-epping-nsw-2121, /property/unit-41-10-14-hazlewood-pl-epping-nsw-2121
    const profile = path.match(new RegExp(`^/property/([a-z0-9-]+)-(${STATE_PATTERN})-(\\d{4})$`))
    if (profile) return { site, kind: 'profile', addressSlug: profile[1]!, state: profile[2]!, postcode: profile[3]! }
    return null
  }

  if (site === 'homely') {
    // Every listing (rent, sale, sold, leased): /homes/20-lydwin-crescent-east-toowoomba-qld-4350/13595229. There
    // are no profile pages. The slug is the full address, kebab-cased.
    const listing = path.match(new RegExp(`^/homes/([a-z0-9-]+)-(${STATE_PATTERN})-(\\d{4})/\\d+$`))
    if (listing) return { site, kind: 'listing', addressSlug: listing[1]!, state: listing[2]!, postcode: listing[3]! }
    return null
  }

  // Property profile: /property-profile/8-814-pacific-highway-chatswood-nsw-2067
  const profile = path.match(new RegExp(`^/property-profile/([a-z0-9-]+)-(${STATE_PATTERN})-(\\d{4})$`))
  if (profile) return { site, kind: 'profile', addressSlug: profile[1]!, state: profile[2]!, postcode: profile[3]! }
  // Listing: /3-42-kent-street-epping-nsw-2121-17650798
  const listing = path.match(new RegExp(`^/([a-z0-9-]+)-(${STATE_PATTERN})-(\\d{4})-(\\d+)$`))
  if (listing) return { site, kind: 'listing', addressSlug: listing[1]!, state: listing[2]!, postcode: listing[3]! }
  return null
}

export interface TitleAddress {
  address: string
  // The address part of the title before removing status prefixes, when different
  titleAddress?: string
  suburb: string
  state?: string
  postcode?: string
}

// Words some titles put before the address, e.g. domain.com.au's sold listings
const STATUS_PREFIX = /^(?:sold|leased|under offer|under contract|deposit taken|for sale|for rent|for lease)\b[\s:–-]*/i

// Reads the address from a page title. Formats seen on the live sites (CLAUDE.md has the full list):
//   realestate.com.au: "72 Somerset St, Epping, NSW 2121 - House for Rent - realestate.com.au"
//   realestate.com.au sold: "46 Stanley Road, Epping, NSW 2121 - Property Details"
//   domain.com.au: "2/5 Chester Street, Epping NSW 2121 - Apartment For Rent | Domain"
//   domain.com.au sold: "Sold 46 Stanley Road, Epping NSW 2121 on 10 Oct 2026 - 2021146795 | Domain"
//   homely.com.au: "20 Lydwin Crescent, East Toowoomba QLD 4350 - House For Sale"
//   domain.com.au profiles leave out the state and postcode: "8/814 Pacific Highway, Chatswood | Property Value…"
// The street address may itself contain commas ("Unit 5, 12 Smith Street"), so it's everything before the suburb.
// Spacing inside the address is kept as-is: 1.x saved it that way (e.g. "97  yates ave"), and legacyAddress() has to
// reproduce it to find those comments.
export function parseAddressFromTitle(title: string): TitleAddress | null {
  const text = title.replace(/[\r\n\t]+/g, ' ').trim()
  if (!text) return null

  const withAddress = (titleAddress: string, rest: Omit<TitleAddress, 'address' | 'titleAddress'>): TitleAddress => {
    const raw = titleAddress.trim()
    const address = raw.replace(STATUS_PREFIX, '').trim()
    return address === raw ? { address, ...rest } : { address, titleAddress: raw, ...rest }
  }

  const full = text.match(new RegExp(`^(.+?),\\s*([^,|]+?),?\\s+(${STATE_PATTERN})\\s+(\\d{4})\\b`, 'i'))
  if (full) {
    return withAddress(full[1]!, { suburb: full[2]!.trim(), state: full[3]!.toLowerCase(), postcode: full[4]! })
  }

  const noState = text.match(/^(.+?),\s*([^,|]+?)\s*(?:\||$)/)
  if (noState) return withAddress(noState[1]!, { suburb: noState[2]!.trim() })
  return null
}

export type Match = 'full' | 'partial' | 'none'

// Checks an address read from the page against the URL. This is what stops comments being shown or saved for the
// wrong property: when a site changes the URL before the title (client-side navigation), the stale title describes
// the previous property and won't match.
// - full: the street address matches the URL too (only possible when the URL contains it)
// - partial: suburb, state and postcode match, but the URL has no street address to compare with
// - none: something contradicts the URL
// When the URL has the street address, it also trims any unexpected leading words from the title's address
// ("Price guide 46 Stanley Road" → "46 Stanley Road"), and returns the address to use.
export function matchAddressToUrl(found: TitleAddress, url: PropertyUrl): { match: Match; address: string } {
  const none = { match: 'none' as const, address: found.address }
  if (found.state && found.state !== url.state) return none
  if (found.postcode && url.postcode && found.postcode !== url.postcode) return none
  const suburbSlug = slugify(found.suburb)
  if (!suburbSlug) return none

  if (url.suburbSlug !== undefined) {
    return { match: url.suburbSlug === suburbSlug ? 'partial' : 'none', address: found.address }
  }
  if (!url.addressSlug) return none
  if (!url.addressSlug.endsWith(`-${suburbSlug}`)) return none

  const urlAddress = comparableAddress(url.addressSlug.slice(0, -suburbSlug.length - 1))
  const words = found.address.split(/\s+/)
  for (let start = 0; start < words.length; start++) {
    const candidate = words.slice(start).join(' ')
    if (!hasStreetNumber(candidate)) break
    if (comparableAddress(candidate) === urlAddress)
      return { match: 'full', address: start ? candidate : found.address }
  }
  return { match: 'partial', address: found.address }
}

// Reduces an address, or a URL's address slug, to a form where the sites' different spellings compare equal:
// "41/10-14 Hazlewood Place" and "unit-41-10-14-hazlewood-pl" both become "41-10-14-hazlewood-place".
function comparableAddress(text: string): string {
  const words = slugify(text).split('-').filter(Boolean)
  if (words.length > 2 && UNIT_WORDS.has(words[0]!)) words.shift()
  return slugify(mapStreetType(words.join(' '), STREET_TYPES))
}

const UNIT_WORDS = new Set(['unit', 'apartment', 'apt', 'flat', 'villa', 'townhouse', 'suite', 'u'])

export interface PageProperty {
  site: Site
  kind: PageKind
  match: Exclude<Match, 'none'>
  input: PropertyInput
  // Shown in the panel header, e.g. "3/42 Kent Street" and "Epping NSW 2121"
  displayAddress: string
  displayLocality: string
}

// The property a page is about, or null when it can't be confirmed from this URL and title.
export function identifyProperty(url: string, title: string): PageProperty | null {
  const urlInfo = parsePropertyUrl(url)
  if (!urlInfo) return null
  const found = parseAddressFromTitle(title)
  // Listings can hide the address ("Address available on request"); those can't be told apart, so skip them
  if (!found || !hasStreetNumber(found.address)) return null
  const { match, address } = matchAddressToUrl(found, urlInfo)
  if (match === 'none') return null

  const postcode = found.postcode ?? urlInfo.postcode
  if (!postcode) return null
  const state = found.state ?? urlInfo.state
  const input: PropertyInput = { address, suburb: found.suburb, state, postcode, url: pageKey(url) }
  if (found.titleAddress) input.titleAddress = found.titleAddress
  else if (address !== found.address) input.titleAddress = found.address
  return {
    site: urlInfo.site,
    kind: urlInfo.kind,
    match,
    input,
    // As the site wrote it, e.g. "15A Ryde St"
    displayAddress: collapse(address),
    displayLocality: `${titleCase(collapse(found.suburb))} ${state.toUpperCase()} ${postcode}`,
  }
}

export interface PropertyLinks {
  realestate: string
  domain: string
  // A web search for the address, for the rare address neither site has a page for
  search: string
}

// Pages for a property that don't go away. Listings do: realestate.com.au deletes a listing's page once it's rented
// or sold. Both sites keep a profile page for essentially every address, which shows the property's history and
// links to any current listing. Built from the address alone, no fetching.
//   realestate.com.au: /property/46-stanley-rd-epping-nsw-2121/, /property/unit-41-10-14-hazlewood-pl-epping-nsw-2121/
//   domain.com.au:     /property-profile/46-stanley-road-epping-nsw-2121, /property-profile/41-10-14-hazlewood-place-…
export function propertyLinks(key: {
  address: string
  suburb: string
  state: string
  postcode: string
}): PropertyLinks {
  const address = canonicalAddress(key.address)
  const locality = `${slugify(key.suburb)}-${key.state.toLowerCase()}-${key.postcode}`
  const unit = address.split(' ')[0]!.includes('/') ? 'unit-' : ''
  const label = `${titleCase(address)}, ${titleCase(collapse(key.suburb))} ${key.state.toUpperCase()} ${key.postcode}`
  return {
    realestate: `https://www.realestate.com.au/property/${unit}${slugify(abbreviateStreetType(address))}-${locality}/`,
    domain: `https://www.domain.com.au/property-profile/${slugify(address)}-${locality}`,
    search: `https://www.google.com/search?q=${encodeURIComponent(label)}`,
  }
}

export function hasStreetNumber(address: string): boolean {
  return /\d/.test(address)
}

export function isPropertyUrl(url: string): boolean {
  return parsePropertyUrl(url) !== null
}

const STREET_TYPES: Record<string, string> = {
  al: 'alley',
  ally: 'alley',
  app: 'approach',
  arc: 'arcade',
  av: 'avenue',
  ave: 'avenue',
  bvd: 'boulevard',
  blvd: 'boulevard',
  bwy: 'broadway',
  cct: 'circuit',
  cir: 'circle',
  cl: 'close',
  cnr: 'corner',
  cr: 'crescent',
  cres: 'crescent',
  crs: 'crescent',
  ct: 'court',
  crt: 'court',
  dr: 'drive',
  drv: 'drive',
  esp: 'esplanade',
  gdns: 'gardens',
  gr: 'grove',
  gve: 'grove',
  hwy: 'highway',
  ln: 'lane',
  mwy: 'motorway',
  pde: 'parade',
  pkwy: 'parkway',
  pl: 'place',
  prom: 'promenade',
  rd: 'road',
  rdg: 'ridge',
  sq: 'square',
  st: 'street',
  tce: 'terrace',
  tr: 'track',
  wy: 'way',
}
const STREET_ABBREVIATIONS: Record<string, string> = {
  alley: 'al',
  approach: 'app',
  arcade: 'arc',
  avenue: 'ave',
  boulevard: 'bvd',
  broadway: 'bwy',
  circuit: 'cct',
  circle: 'cir',
  close: 'cl',
  corner: 'cnr',
  crescent: 'cres',
  court: 'ct',
  drive: 'dr',
  esplanade: 'esp',
  gardens: 'gdns',
  grove: 'gr',
  highway: 'hwy',
  lane: 'ln',
  motorway: 'mwy',
  parade: 'pde',
  parkway: 'pkwy',
  place: 'pl',
  promenade: 'prom',
  road: 'rd',
  ridge: 'rdg',
  square: 'sq',
  street: 'st',
  terrace: 'tce',
  track: 'tr',
  way: 'wy',
}
const DIRECTIONS = new Set(['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'])

// The normalized address new comments are saved under: lowercase, single spaces, "unit 5, 12 x" → "5/12 x",
// "21 - 25" → "21-25", and the street type spelled out ("st" → "street").
export function canonicalAddress(address: string): string {
  let text = collapse(address.toLowerCase().replace(/[.']/g, ''))
  text = text.replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/')
  text = text.replace(
    /^(?:unit|apartment|apt|flat|villa|townhouse|suite|u)\s*([0-9]+[a-z]?)\s*(?:,|\/)?\s*(\d+[a-z]?(?:-\d+[a-z]?)?)\s/,
    '$1/$2 ',
  )
  text = collapse(text.replace(/,/g, ' '))
  return mapStreetType(text, STREET_TYPES)
}

export function abbreviateStreetType(address: string): string {
  return mapStreetType(address, STREET_ABBREVIATIONS)
}

// The key the 1.x versions saved: the title text lowercased, with spaces around hyphens removed.
export function legacyAddress(address: string): string {
  return address
    .trim()
    .toLowerCase()
    .replace(/\s+-\s+/g, '-')
}

export function buildPropertyKeys(input: PropertyInput): PropertyKeys {
  const address = canonicalAddress(input.address)
  const legacy = [input.address, input.titleAddress].filter(text => text !== undefined).map(legacyAddress)
  const addressVariants = [
    ...new Set([
      address,
      abbreviateStreetType(address),
      ...legacy.flatMap(key => [key, collapse(key), mapStreetType(collapse(key), STREET_TYPES)]),
    ]),
  ].filter(Boolean)
  return {
    address,
    addressVariants,
    suburb: collapse(input.suburb.toLowerCase()),
    state: input.state.toLowerCase(),
    postcode: input.postcode,
  }
}

function mapStreetType(address: string, map: Record<string, string>): string {
  const words = address.split(' ')
  // The street type is the last word, or the one before a trailing direction ("smith st north")
  let index = words.length - 1
  if (index > 1 && DIRECTIONS.has(words[index]!)) index--
  // Leave the number alone, e.g. "12 st" is a street called "St", not a street type
  if (index < 2) return address
  const replacement = map[words[index]!]
  if (!replacement) return address
  words[index] = replacement
  return words.join(' ')
}

// A single word with any street type abbreviation spelled out: "rd" → "road"
export function expandStreetWord(word: string): string {
  return STREET_TYPES[word] ?? word
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function titleCase(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/(^|[\s\-/(])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
      // Street number suffixes: "15a" → "15A"
      .replace(/(\d)([a-z])\b/g, (_, digit: string, letter: string) => digit + letter.toUpperCase())
  )
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
