import type { PostRecord } from '../src/shared/rate-limit'

import { describe, expect, it } from 'vitest'

import { rateLimitReason } from '../src/shared/rate-limit'
import { cleanUsername, countLinks, isPropertyInput, validateCommentText } from '../src/shared/validation'

describe('validateCommentText', () => {
  it('accepts a normal comment', () => {
    expect(validateCommentText('Mould in the bathroom, landlord slow to fix things.')).toBeNull()
  })

  it('rejects comments that are too short, too long, too many lines or spammy', () => {
    expect(validateCommentText('   hi  ')).toMatch(/at least/)
    expect(validateCommentText('a b '.repeat(400))).toMatch(/longer than/)
    expect(validateCommentText('line\n'.repeat(60))).toMatch(/lines/)
    expect(validateCommentText('Great!!!!!!!!!!!!!!')).toMatch(/repeated/)
  })
})

describe('cleanUsername', () => {
  it('trims, collapses spaces, truncates and defaults to Anonymous', () => {
    expect(cleanUsername('  Jane   Doe ')).toBe('Jane Doe')
    expect(cleanUsername('   ')).toBe('Anonymous')
    expect(cleanUsername('x'.repeat(80))).toHaveLength(50)
  })
})

describe('isPropertyInput', () => {
  const valid = {
    address: '3/42 Kent Street',
    suburb: 'Epping',
    state: 'nsw',
    postcode: '2121',
    url: 'https://www.domain.com.au/3-42-kent-street-epping-nsw-2121-17650798',
  }

  it('accepts valid property details', () => {
    expect(isPropertyInput(valid)).toBe(true)
  })

  it('rejects anything malformed or from another site', () => {
    expect(isPropertyInput(null)).toBe(false)
    expect(isPropertyInput({ ...valid, url: 'https://evil.example/x' })).toBe(false)
    expect(isPropertyInput({ ...valid, url: 'http://www.domain.com.au/x' })).toBe(false)
    expect(isPropertyInput({ ...valid, state: 'xx' })).toBe(false)
    expect(isPropertyInput({ ...valid, postcode: '21' })).toBe(false)
    expect(isPropertyInput({ ...valid, address: 'Address available on request' })).toBe(false)
    expect(isPropertyInput({ ...valid, suburb: 42 })).toBe(false)
  })
})

describe('rateLimitReason', () => {
  const limits = { cooldownMs: 30_000, perHour: 5, perDay: 15, things: 'comments', done: 'posted', doing: 'posting' }
  const now = Date.UTC(2026, 0, 1)
  const minutesAgo = (...minutes: number[]): PostRecord[] => minutes.map(m => ({ at: now - m * 60_000 }))

  it('allows posting with no history', () => {
    expect(rateLimitReason([], now, limits)).toBeNull()
  })

  it('makes posters wait between posts', () => {
    expect(rateLimitReason([{ at: now - 10_000 }], now, limits)).toBe('Please wait 20 seconds before posting again.')
    expect(rateLimitReason([{ at: now - 30_000 }], now, limits)).toBeNull()
  })

  it('limits posts per hour and per day', () => {
    expect(rateLimitReason(minutesAgo(1, 10, 20, 30, 40), now, limits)).toMatch(/5 comments an hour/)
    expect(rateLimitReason(minutesAgo(10, 20, 30, 40, 61), now, limits)).toBeNull()
    const day = minutesAgo(...Array.from({ length: 15 }, (_, i) => 61 + i * 60))
    expect(rateLimitReason(day, now, limits)).toMatch(/15 comments a day/)
    expect(rateLimitReason(day.slice(1), now, limits)).toBeNull()
  })
})

describe('countLinks', () => {
  it('counts links, images and bare addresses', () => {
    expect(countLinks('No links here, just a www-less comment.')).toBe(0)
    expect(countLinks('[pic](https://i.imgur.com/a.jpg) ![b](http://x.com/b.png) see www.example.com')).toBe(3)
    // A www inside a URL is one link, not two
    expect(countLinks('https://www.example.com/page')).toBe(1)
  })

  it('limits links per comment', () => {
    const links = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`).join(' ')
    expect(validateCommentText(links(8))).toBeNull()
    expect(validateCommentText(links(9))).toMatch(/8 links/)
  })
})
