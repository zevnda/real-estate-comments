// Address search over comments that already exist. Firestore has no fuzzy or full-text search, so it works in two
// steps. First Firestore fetches candidates using whatever the query gives it (searchLookups), each served by an index
// that already exists: comments at the street number (prefix range on `address`), in the postcode (equality on
// `postcode`), or in the suburb (prefix range on `suburb`), falling back to the most recent comments. Then scoreMatch()
// ranks the candidates by how closely the address, suburb, state and postcode match, tolerating typos, abbreviations
// and unfinished words.
//
// Pure functions, shared by the background script and the tests.

import { canonicalAddress, expandStreetWord, STATES } from './property'

export interface SearchQuery {
  // The street number with any unit, when the query starts with one, e.g. "41/10-14"
  number?: string
  // The other words, lowercased with street types spelled out, e.g. ["hazlewood", "place", "epping"]
  words: string[]
  // Possible suburbs: the last one, two and three words as typed ("epping", "road epping", …), for suburb lookups
  suburbs: string[]
  state?: string
  postcode?: string
}

// One Firestore query that fetches search candidates
export type SearchLookup =
  | { kind: 'number'; prefix: string }
  | { kind: 'postcode'; postcode: string }
  | { kind: 'suburb'; prefix: string }
  // The most recent comments, scanned when nothing more specific matched (a street on its own, a misspelt suburb)
  | { kind: 'recent' }

export interface SearchCandidate {
  address: string
  suburb: string
  state?: string
  postcode?: string
}

// Results scoring below this aren't shown
export const MIN_SCORE = 0.7

// Accepts a full or partial address, a street, a suburb or a postcode. Null when there's nothing to search for.
export function parseSearchQuery(text: string): SearchQuery | null {
  let words = text.toLowerCase().replace(/[,|]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.join('').length < 2) return null

  let postcode: string | undefined
  let state: string | undefined
  // The postcode and state come last. A 4-digit first word is a street number, unless it's all there is.
  if ((words.length > 1 || words[0]!.length === 4) && /^\d{4}$/.test(words.at(-1)!)) postcode = words.pop()
  if (words.length && (STATES as readonly string[]).includes(words.at(-1)!)) state = words.pop()

  // canonicalAddress turns "unit 41, 10-14 hazlewood pl" into "41/10-14 hazlewood pl…" so the number comes first
  words = words.length ? canonicalAddress(words.join(' ')).split(' ') : []
  const number = words[0] && /^\d/.test(words[0]) ? words.shift() : undefined

  const query: SearchQuery = {
    words: words.map(expandStreetWord),
    suburbs: [1, 2, 3].filter(n => n <= words.length).map(n => words.slice(-n).join(' ')),
  }
  if (number) query.number = number
  if (state) query.state = state
  if (postcode) query.postcode = postcode
  return query
}

// The Firestore lookups for a query, most specific first. The background runs them all and, if nothing scores well
// enough, falls back to { kind: 'recent' }.
export function searchLookups(query: SearchQuery): SearchLookup[] {
  // A street number narrows it down to a handful of comments; postcode and suburb would only add noise
  if (query.number) return [{ kind: 'number', prefix: `${query.number} ` }]
  const lookups: SearchLookup[] = []
  if (query.postcode) lookups.push({ kind: 'postcode', postcode: query.postcode })
  for (const suburb of query.suburbs) lookups.push({ kind: 'suburb', prefix: suburb })
  return lookups
}

// How well a property matches the query, from 0 to 1. A street number in the query was already matched by the
// Firestore lookup, so only the other words are compared.
export function scoreMatch(query: SearchQuery, candidate: SearchCandidate): number {
  if (query.postcode && candidate.postcode && query.postcode !== candidate.postcode) return 0
  if (query.state && candidate.state && query.state !== candidate.state) return 0
  if (!query.words.length) return 1

  const candidateWords = [
    ...canonicalAddress(candidate.address).split(' ').slice(1),
    ...candidate.suburb.toLowerCase().split(/\s+/),
  ].map(expandStreetWord)

  let total = 0
  for (const word of query.words) {
    const best = Math.max(0, ...candidateWords.map(candidateWord => wordSimilarity(word, candidateWord)))
    // Every word must roughly match something, so a wrong street or suburb can't be outvoted by the right ones
    if (best < MIN_WORD_SCORE) return 0
    total += best
  }
  return total / query.words.length
}

// A single typed word scoring below this rules the property out (one typo in a 4-letter word scores 0.75)
const MIN_WORD_SCORE = 0.6

// 1 for the same word; high for a word still being typed ("stan" → "stanley"); otherwise based on edit distance,
// so typos still match ("stanly" → "stanley")
export function wordSimilarity(typed: string, word: string): number {
  if (typed === word) return 1
  if (typed.length >= 2 && word.startsWith(typed)) return 0.9
  const distance = editDistance(typed, word)
  return Math.max(0, 1 - distance / Math.max(typed.length, word.length))
}

// Damerau-Levenshtein (optimal string alignment) distance: insertions, deletions, substitutions and swaps
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, rows[i - 2]![j - 2]! + 1)
      rows[i]![j] = value
    }
  }
  return rows[a.length]![b.length]!
}
