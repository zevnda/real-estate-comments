const relative = new Intl.RelativeTimeFormat('en-AU', { numeric: 'auto' })
const absolute = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function formatRelative(ms: number, now = Date.now()): string {
  if (!ms) return 'a while ago'
  const diff = ms - now
  if (Math.abs(diff) < 60 * 1000) return 'just now'
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return relative.format(Math.round(diff / size), unit)
  }
  return 'just now'
}

export function formatAbsolute(ms: number): string {
  return ms ? absolute.format(ms) : ''
}

// A stable colour per name, so the same commenter is easy to spot in a thread
export function avatarHue(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => [...word][0]?.toUpperCase() ?? '')
    .join('')
  return letters || '?'
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
