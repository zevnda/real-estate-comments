// Reviews imported from ShitRentals as comments (see CLAUDE.md → "ShitRentals reviews"). No imports, so the import
// scripts can use it too.

// The comment's `source` field
export const SHITRENTALS_SOURCE = 'shitrentals'

// Their photos, copied to our R2 bucket as <attachment ID>.webp
const IMAGE_BASE = 'https://rec.cdn-steamgameidler.com/sr/'
// Airtable attachment IDs: "att" and 14 letters and digits. Checked, since the ID goes into the URL.
const ATTACHMENT_ID = /^att[A-Za-z0-9]{10,20}$/

export function shitRentalsImageUrl(id: string): string | null {
  return ATTACHMENT_ID.test(id) ? `${IMAGE_BASE}${id}.webp` : null
}

export function shitRentalsImageKey(id: string): string {
  return `sr/${id}.webp`
}

// An imported review's text ends with a link to the review on ShitRentals' Airtable, "View on ShitRentals →", or
// "View more on ShitRentals →" when it was shortened (scripts/shitrentals/parse.ts). Older versions show it as written;
// newer ones take it off the text and show a button (and a "Read more" link when it was shortened).
const REVIEW_LINK =
  /\n\n\[View (more )?on ShitRentals →\]\((https:\/\/airtable\.com\/app5nuiBfQvyyqojK\/[A-Za-z0-9/]+)\)\s*$/

export function splitReviewLink(text: string): { text: string; url: string; shortened: boolean } | null {
  const match = REVIEW_LINK.exec(text)
  if (!match) return null
  return { text: text.slice(0, match.index), url: match[2]!, shortened: !!match[1] }
}
