import type { PageProperty, Site } from './property.ts'
import type { EmbedSite } from './sites.ts'

import { getSite, identifyProperty } from './property.ts'
import { EMBED_SITES } from './sites.ts'

// The embed: a comment section that partner sites (EMBED_SITES) put on their property pages as an iframe of the
// comment relay's /embed page (see CLAUDE.md, "Embed"). The relay serves the page and the comments; the page itself
// is the extension's own comment UI, built for the iframe (src/embed/).

export const EMBED_PATH = '/embed'
// The embed's script, a static asset served next to the relay (built into dist/relay by `pnpm build`)
export const EMBED_SCRIPT = '/embed.js'
// GET, with the same query string as the embed page: the property's comments
export const EMBED_COMMENTS_PATH = '/comments'
// How long the relay's embed answers may be cached by Cloudflare (Workers Cache) and the relay's copy of the
// on/off switch kept, so roughly how long switching the embed on or off takes to show
export const EMBED_CACHE_SECONDS = 60

// The on/off switch: one Firestore document, written by `pnpm moderate`, read by the relay. No document (or
// `enabled: false`) means the embed is off everywhere; each site also has to be switched on.
export const EMBED_CONFIG_DOC = 'config/embed'

export interface EmbedConfig {
  enabled: boolean
  sites: Partial<Record<Site, boolean>>
}

export const EMBED_OFF: EmbedConfig = { enabled: false, sites: {} }

export function parseEmbedConfig(fields: Record<string, unknown> | null | undefined): EmbedConfig {
  if (!fields) return EMBED_OFF
  const sites: Partial<Record<Site, boolean>> = {}
  const stored = fields.sites
  if (stored && typeof stored === 'object') {
    for (const { site } of EMBED_SITES) {
      if ((stored as Record<string, unknown>)[site] === true) sites[site] = true
    }
  }
  return { enabled: fields.enabled === true, sites }
}

export function embedEnabled(config: EmbedConfig, site: Site): boolean {
  return config.enabled && config.sites[site] === true && EMBED_SITES.some(embed => embed.site === site)
}

// The partner site a page URL is on, if it's one
export function embedSiteFor(url: string): EmbedSite | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const site = getSite(parsed.hostname)
    return EMBED_SITES.find(embed => embed.site === site) ?? null
  } catch {
    return null
  }
}

// What the partner page passes in the embed's URL: its own address (`url`) and the property's address as it shows
// it, in separate fields
export const EMBED_PARAMS = ['url', 'address', 'suburb', 'state', 'postcode'] as const

// The property an embed is for, from its query string. The address is checked against the page URL with the same
// matching the extension uses on property pages, and only a full match counts (partner URLs carry the whole
// address), so a page can't show or save comments under the wrong property.
export function embedProperty(params: URLSearchParams): PageProperty | null {
  const values = EMBED_PARAMS.map(key => params.get(key)?.trim() ?? '')
  if (values.some(value => !value || value.length > 300)) return null
  const [url, address, suburb, state, postcode] = values as [string, string, string, string, string]
  if (!embedSiteFor(url)) return null
  // In the format parseAddressFromTitle reads: "11/260 Casuarina Drive, Nightcliff, NT 0810"
  const property = identifyProperty(url, `${address}, ${suburb}, ${state.toUpperCase()} ${postcode}`)
  return property?.match === 'full' ? property : null
}

// A comment as the relay's /comments returns it: public fields only, the same for every viewer, so it can be cached.
// Whether a comment is the viewer's own, or they've upvoted it, is remembered by the embed itself.
export interface EmbedComment {
  id: string
  text: string
  username: string
  // Milliseconds since the epoch, or 0 if unknown
  createdAt: number
  votes: number
  editedAt?: number
  parentId?: string
  replyToId?: string
}

// What the embed posts to the partner page, as a JSON string: its height, so the page can size the iframe to fit
export interface EmbedMessage {
  source: 'rec-embed'
  type: 'height'
  height: number
}
