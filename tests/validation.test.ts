import { describe, expect, it } from 'vitest'

import { MAX_POSTS_PER_HOUR, MAX_POSTS_PER_PROPERTY_PER_DAY, rateLimitReason } from '../src/background/rate-limit'
import { cleanUsername, isPropertyInput, validateCommentText } from '../src/shared/validation'

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
  const now = Date.UTC(2026, 0, 1)
  const minutesAgo = (minutes: number, property = 'a') => ({ at: now - minutes * 60_000, property })

  it('allows posting with no history', () => {
    expect(rateLimitReason([], 'a', now)).toBeNull()
  })

  it('limits posts per hour across all properties', () => {
    const history = Array.from({ length: MAX_POSTS_PER_HOUR }, (_, i) => minutesAgo(i * 5, `p${i}`))
    expect(rateLimitReason(history, 'new', now)).toMatch(/an hour/)
    expect(
      rateLimitReason(
        history.map(p => ({ ...p, at: p.at - 60 * 60_000 })),
        'new',
        now,
      ),
    ).toBeNull()
  })

  it('limits posts per property per day', () => {
    const history = Array.from({ length: MAX_POSTS_PER_PROPERTY_PER_DAY }, (_, i) => minutesAgo(120 + i * 60))
    expect(rateLimitReason(history, 'a', now)).toMatch(/same property/)
    expect(rateLimitReason(history, 'b', now)).toBeNull()
  })

  it('lets replies continue a conversation, within the hourly limit', () => {
    const comments = Array.from({ length: MAX_POSTS_PER_PROPERTY_PER_DAY }, (_, i) => minutesAgo(120 + i * 60))
    expect(rateLimitReason(comments, 'a', now, true)).toBeNull()
    // Replies don't use up the property's daily comments
    const replies = comments.map(post => ({ ...post, reply: true }))
    expect(rateLimitReason(replies, 'a', now)).toBeNull()
    const busyHour = Array.from({ length: MAX_POSTS_PER_HOUR }, (_, i) => ({ ...minutesAgo(i * 5), reply: true }))
    expect(rateLimitReason(busyHour, 'a', now, true)).toMatch(/an hour/)
  })
})
