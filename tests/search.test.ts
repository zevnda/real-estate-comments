import { describe, expect, it } from 'vitest'

import { MIN_SCORE, parseSearchQuery, scoreMatch, searchLookups, wordSimilarity } from '../src/shared/search'

const STANLEY = { address: '46 stanley road', suburb: 'epping', state: 'nsw', postcode: '2121' }
const HAZLEWOOD = { address: '41/10-14 hazlewood place', suburb: 'epping', state: 'nsw', postcode: '2121' }
const YATES = { address: '97  yates ave', suburb: 'dundas valley', state: 'nsw', postcode: '2117' }

const matches = (query: string, candidate: typeof STANLEY) =>
  scoreMatch(parseSearchQuery(query)!, candidate) >= MIN_SCORE

describe('parseSearchQuery', () => {
  it('splits a full address into number, words, state and postcode', () => {
    expect(parseSearchQuery('46 Stanley Rd, Epping NSW 2121')).toEqual({
      number: '46',
      words: ['stanley', 'road', 'epping'],
      // Suburb guesses keep the words as typed: they're matched against stored suburb names
      suburbs: ['epping', 'rd epping', 'stanley rd epping'],
      state: 'nsw',
      postcode: '2121',
    })
  })

  it('puts units in the stored "unit/number" form', () => {
    expect(parseSearchQuery('Unit 41, 10-14 Hazlewood Pl')?.number).toBe('41/10-14')
    expect(parseSearchQuery('41/10-14 hazlewood')?.number).toBe('41/10-14')
  })

  it('treats a 4-digit first number as a street number, but a lone 4-digit number as a postcode', () => {
    expect(parseSearchQuery('1234 Main Road')?.number).toBe('1234')
    expect(parseSearchQuery('2121')).toEqual({ words: [], suburbs: [], postcode: '2121' })
  })

  it('accepts a street or suburb without a number', () => {
    expect(parseSearchQuery('Stanley Rd')).toMatchObject({ words: ['stanley', 'road'] })
    expect(parseSearchQuery('North Strathfield')).toMatchObject({
      words: ['north', 'strathfield'],
      suburbs: ['strathfield', 'north strathfield'],
    })
    expect(parseSearchQuery('Epping NSW')).toMatchObject({ words: ['epping'], state: 'nsw' })
  })

  it('ignores queries too short to search', () => {
    expect(parseSearchQuery('   ')).toBeNull()
    expect(parseSearchQuery('e')).toBeNull()
  })
})

describe('searchLookups', () => {
  it('looks up by street number alone when there is one', () => {
    expect(searchLookups(parseSearchQuery('46 Stanley Road, Epping 2121')!)).toEqual([
      { kind: 'number', prefix: '46 ' },
    ])
  })

  it('otherwise looks up by postcode and possible suburbs', () => {
    expect(searchLookups(parseSearchQuery('Stanley Road, Epping 2121')!)).toEqual([
      { kind: 'postcode', postcode: '2121' },
      { kind: 'suburb', prefix: 'epping' },
      { kind: 'suburb', prefix: 'road epping' },
      { kind: 'suburb', prefix: 'stanley road epping' },
    ])
  })
})

describe('scoreMatch', () => {
  it('matches the full address, with or without suburb, state and postcode', () => {
    expect(matches('46 Stanley Road', STANLEY)).toBe(true)
    expect(matches('46 Stanley Road, Epping NSW 2121', STANLEY)).toBe(true)
    expect(matches('46 stanley', STANLEY)).toBe(true)
    expect(matches('46', STANLEY)).toBe(true)
  })

  it('tolerates abbreviations, typos and unfinished words', () => {
    expect(matches('46 Stanley Rd', STANLEY)).toBe(true)
    expect(matches('46 Stanly Raod Eping', STANLEY)).toBe(true)
    expect(matches('46 stan', STANLEY)).toBe(true)
    expect(matches('97 Yates Avenue Dundas Valley', YATES)).toBe(true)
    expect(matches('unit 41 10-14 hazelwood place', HAZLEWOOD)).toBe(true)
  })

  it('matches by street, suburb or postcode alone', () => {
    expect(matches('Stanley Road', STANLEY)).toBe(true)
    expect(matches('stanly rd', STANLEY)).toBe(true)
    expect(matches('Epping', STANLEY)).toBe(true)
    expect(matches('eping', STANLEY)).toBe(true)
    expect(matches('2121', STANLEY)).toBe(true)
    expect(matches('Hazlewood Place, Epping', HAZLEWOOD)).toBe(true)
    expect(matches('Dundas Valley', YATES)).toBe(true)
  })

  it('rejects a street or suburb that doesn’t match', () => {
    expect(matches('Smith Street', STANLEY)).toBe(false)
    expect(matches('Carlingford', STANLEY)).toBe(false)
    expect(matches('Stanley Road, Carlingford', STANLEY)).toBe(false)
    expect(matches('2150', STANLEY)).toBe(false)
  })

  it('rejects different streets and suburbs', () => {
    expect(matches('46 Smith Street', STANLEY)).toBe(false)
    expect(matches('46 Stanley Road Carlingford', STANLEY)).toBe(false)
  })

  it('rejects a different postcode or state outright', () => {
    expect(matches('46 Stanley Road 3121', STANLEY)).toBe(false)
    expect(matches('46 Stanley Road vic', STANLEY)).toBe(false)
  })

  it('ranks the closer match higher', () => {
    const query = parseSearchQuery('46 Stanley Road Epping')!
    const elsewhere = { ...STANLEY, suburb: 'eastwood' }
    expect(scoreMatch(query, STANLEY)).toBeGreaterThan(scoreMatch(query, elsewhere))
  })
})

describe('wordSimilarity', () => {
  it('scores exact, prefix, typo and unrelated words', () => {
    expect(wordSimilarity('road', 'road')).toBe(1)
    expect(wordSimilarity('stan', 'stanley')).toBe(0.9)
    expect(wordSimilarity('stnaley', 'stanley')).toBeGreaterThan(0.8)
    expect(wordSimilarity('smith', 'stanley')).toBeLessThan(0.5)
  })
})
