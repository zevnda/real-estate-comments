import type { EmbedComment, EmbedConfig } from '../../src/shared/embed.ts'
import type { Firestore } from './firestore.ts'

import {
  EMBED_CACHE_SECONDS,
  EMBED_CONFIG_DOC,
  EMBED_SCRIPT,
  embedEnabled,
  embedProperty,
  parseEmbedConfig,
} from '../../src/shared/embed.ts'
import { buildPropertyKeys } from '../../src/shared/property.ts'
import { EMBED_SITES } from '../../src/shared/sites.ts'

// The embed's routes (see CLAUDE.md, "Embed"): GET /embed, the page partner sites put in an iframe, and GET
// /comments, the property's comments for it. Both are cached by Cloudflare for EMBED_CACHE_SECONDS (Workers Cache,
// `cache` in wrangler.jsonc), so a busy page costs Firestore at most one read of its comments a minute.

const COMMENTS = 'listingcomments'
// Like the extension (MAX_COMMENTS_PER_PROPERTY in src/background/comments.ts)
const MAX_COMMENTS = 100

let config: { value: EmbedConfig; at: number } | null = null

// The on/off switch, kept for EMBED_CACHE_SECONDS per Worker instance. If it can't be read, the embed stays off.
export async function readEmbedConfig(firestore: Firestore, now: number): Promise<EmbedConfig> {
  if (config && now - config.at < EMBED_CACHE_SECONDS * 1000) return config.value
  let value: EmbedConfig
  try {
    value = parseEmbedConfig((await firestore.get(EMBED_CONFIG_DOC))?.fields)
  } catch (error) {
    console.warn('Reading the embed switch failed:', error)
    value = parseEmbedConfig(null)
  }
  config = { value, at: now }
  return value
}

// For tests
export function forgetEmbedConfig() {
  config = null
}

// GET /comments?url=…&address=…&suburb=…&state=…&postcode=…: the same query string as the embed page
export async function embedComments(url: URL, firestore: Firestore, settings: EmbedConfig): Promise<Response> {
  const property = embedProperty(url.searchParams)
  if (!property) return cachedJson({ ok: false, error: 'Couldn’t read this property’s address.' }, 400)
  if (!embedEnabled(settings, property.site)) {
    return cachedJson({ ok: false, error: 'Comments are switched off on this site.' }, 403)
  }
  const keys = buildPropertyKeys(property.input)
  // The extension's lookup: 1.x's composite index (address, suburb, createdAt desc) serves it
  const documents = await firestore.query(
    COMMENTS,
    [
      { field: 'address', op: 'IN', value: keys.addressVariants },
      { field: 'suburb', op: 'EQUAL', value: keys.suburb },
    ],
    'createdAt',
    MAX_COMMENTS,
  )
  const comments = documents
    // The query can't include the postcode, so drop same-named streets in same-named suburbs elsewhere
    .filter(({ fields }) => !fields.postcode || fields.postcode === keys.postcode)
    .map(({ id, fields }) => toEmbedComment(id, fields))
  return cachedJson({ ok: true, data: comments }, 200)
}

// Public fields only: no user IDs, so the answer is the same for everyone and can be cached
export function toEmbedComment(id: string, fields: Record<string, unknown>): EmbedComment {
  const created =
    fields.createdAt instanceof Date
      ? fields.createdAt.getTime()
      : typeof fields.timestamp === 'string'
        ? Date.parse(fields.timestamp)
        : NaN
  const comment: EmbedComment = {
    id,
    text: typeof fields.text === 'string' ? fields.text : '',
    username: (typeof fields.username === 'string' && fields.username.trim()) || 'Anonymous',
    createdAt: Number.isFinite(created) ? created : 0,
    votes: typeof fields.votes === 'number' ? Math.max(0, fields.votes) : 0,
  }
  if (fields.editedAt instanceof Date) comment.editedAt = fields.editedAt.getTime()
  if (typeof fields.parentId === 'string') comment.parentId = fields.parentId
  if (typeof fields.replyToId === 'string') comment.replyToId = fields.replyToId
  return comment
}

// GET /embed: the page in the partner's iframe. While the embed is off for the site (or the address doesn't match
// the page), it's empty and never reports a height, so the snippet's iframe stays at zero height: nothing shows.
// `emulator`: the Firestore emulator's address when the relay runs against it (`pnpm embed:preview`), so the embed
// deletes there too (see src/embed/api.ts). Never set in production.
export function embedPage(url: URL, settings: EmbedConfig, emulator?: string): Response {
  const property = embedProperty(url.searchParams)
  const on = !!property && embedEnabled(settings, property.site)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">${
    emulator
      ? `
<meta name="rec-firestore" content="${emulator}">`
      : ''
  }
<title>Comments · Real Estate Comments</title>
<style>html, body { margin: 0; background: transparent; }</style>
</head>
<body>${on ? `\n<script src="${EMBED_SCRIPT}"></script>` : ''}
</body>
</html>`
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    // The UI's styles go in a <style> in its shadow root, and avatars set a colour inline
    "style-src 'self' 'unsafe-inline'",
    // The partner theme's font (/fonts/)
    "font-src 'self'",
    // Image thumbnails, from the allow-listed hosts only (see src/shared/images.ts)
    'img-src https:',
    // The relay, and anonymous Firebase sign-in and deleting your own comment (Firestore, under the rules)
    `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com${emulator ? ` ${emulator}` : ''}`,
    // The bot check (/challenge)
    "frame-src 'self'",
    `frame-ancestors ${embedOrigins().join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${EMBED_CACHE_SECONDS}`,
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

// Pages on the viewer's own computer, on any port, so partners can try the embed while they develop their site
// (`next dev` and the like) and `pnpm embed:preview` works. Harmless: a public site can't be served as localhost, and
// the embed still only shows a partner site's property (see embedProperty), with every post checked as usual.
const DEVELOPMENT_ORIGINS = ['http://localhost:*', 'http://127.0.0.1:*']

// The pages that may frame the embed (and, inside it, the challenge page): partner sites, and local development
export function embedOrigins(): string[] {
  return [...EMBED_SITES.flatMap(site => site.origins), ...DEVELOPMENT_ORIGINS]
}

function cachedJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${EMBED_CACHE_SECONDS}`,
      'x-content-type-options': 'nosniff',
    },
  })
}
