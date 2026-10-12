import type { Locality, SourceRecord } from '../scripts/shitrentals/parse.ts'

import { describe, expect, it } from 'vitest'

import {
  buildPostcodeIndex,
  cleanAddress,
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  commentText,
  escapeMarkdown,
  parseRecord,
  resolveLocality,
} from '../scripts/shitrentals/parse.ts'
import { splitReviewLink } from '../src/shared/shitrentals'
import * as validation from '../src/shared/validation'

const URL = 'https://airtable.com/app/shr/tbl/viw/recABC'

// A few rows in the postcode list's format, including same-named places
const CSV = [
  'id,postcode,locality,state,long,lat,dc,type',
  '1,"3166","OAKLEIGH","VIC","145.09","-37.90","","Delivery Area"',
  '2,"3182","ST KILDA","VIC","144.98","-37.86","","Delivery Area"',
  '3,"3000","MELBOURNE","VIC","144.96","-37.81","","Delivery Area"',
  '4,"3004","MELBOURNE","VIC","144.97","-37.84","","Delivery Area"',
  '5,"2042","ENMORE","NSW","151.17","-33.90","","Delivery Area"',
  '6,"2350","ENMORE","NSW","151.70","-30.60","","Delivery Area"',
  '7,"3001","MELBOURNE","VIC","144.96","-37.81","","Post Office Boxes"',
  '8,"3350","SOLDIERS HILL","VIC","143.86","-37.55","","Delivery Area"',
  '9,"2114","WEST RYDE","NSW","151.09","-33.81","","Delivery Area"',
  '10,"3055","BRUNSWICK WEST","VIC","144.94","-37.76","","Delivery Area"',
  '11,"3056","BRUNSWICK","VIC","144.96","-37.77","","Delivery Area"',
].join('\n')
const index = buildPostcodeIndex(CSV)

function record(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'recABC',
    address: '18 Gamble Street',
    suburb: 'Oakleigh',
    state: 'VIC',
    country: 'Australia',
    review: 'Mould in every room.',
    submittedAt: '2024-01-01T03:39:24.000Z',
    images: [],
    ...overrides,
  }
}

describe('ShitRentals import', () => {
  it('uses the same comment limits as the extension', () => {
    expect(COMMENT_MAX_LENGTH).toBe(validation.COMMENT_MAX_LENGTH)
    expect(COMMENT_MIN_LENGTH).toBe(validation.COMMENT_MIN_LENGTH)
  })

  describe('postcode list', () => {
    it('keeps delivery areas only', () => {
      expect(index.get('melbourne|vic')?.map((area: Locality) => area.postcode)).toEqual(['3000', '3004'])
    })
  })

  describe('suburb and postcode', () => {
    const resolve = (suburb: string, state = 'vic', hints: string[] = []) =>
      resolveLocality(suburb, state, index, hints)

    it('finds the postcode of a suburb', () => {
      expect(resolve('Oakleigh')).toEqual({ ok: true, suburb: 'oakleigh', postcode: '3166', notes: [] })
      expect(resolve('  ST KILDA ')).toMatchObject({ suburb: 'st kilda', postcode: '3182' })
    })

    it('corrects misspelt suburbs', () => {
      expect(resolve('Oakliegh')).toMatchObject({ ok: true, suburb: 'oakleigh', postcode: '3166' })
      expect(resolve('Stkilda')).toMatchObject({ ok: true, suburb: 'st kilda' })
      expect(resolve('Brunswick wesg')).toMatchObject({ ok: true, suburb: 'brunswick west' })
    })

    it('takes off a typed state or postcode, and uses the postcode', () => {
      expect(resolve('Brunswick West VIC 3055')).toMatchObject({ suburb: 'brunswick west', postcode: '3055' })
      expect(resolve('Melbourne 3004')).toMatchObject({ suburb: 'melbourne', postcode: '3004' })
    })

    it('finds a suburb among extra words', () => {
      expect(resolve('Soldiers Hill Ballarat')).toMatchObject({ ok: true, suburb: 'soldiers hill', postcode: '3350' })
      expect(resolve('West Ryde/Ermington', 'nsw')).toMatchObject({ ok: true, suburb: 'west ryde' })
    })

    it('leaves the postcode out when the suburb has several', () => {
      // One suburb split between postcodes
      const melbourne = resolve('Melbourne')
      expect(melbourne).toMatchObject({ ok: true, suburb: 'melbourne' })
      expect(melbourne).not.toHaveProperty('postcode')
      // Two places with the same name
      const enmore = resolve('Enmore', 'nsw')
      expect(enmore).toMatchObject({ ok: true, suburb: 'enmore' })
      expect(enmore).not.toHaveProperty('postcode')
      // Unless the review says which
      expect(resolve('Enmore', 'nsw', ['2042'])).toMatchObject({ postcode: '2042' })
    })

    it('gives up on unknown suburbs', () => {
      expect(resolve('Street')).toEqual({ ok: false, reason: 'suburb not found' })
      expect(resolve('Oakleigh', 'nsw')).toEqual({ ok: false, reason: 'suburb not found' })
    })
  })

  describe('street address', () => {
    const clean = (address: string, suburbs: string[] = []) => {
      const result = cleanAddress(address, suburbs)
      return result.ok ? result.address : result.reason
    }

    it('puts addresses in our canonical form', () => {
      expect(clean('2/204 Clarke Street')).toBe('2/204 clarke street')
      expect(clean('18  Juniper St')).toBe('18 juniper street')
      expect(clean("25/70 O'Shanassy Street")).toBe('25/70 oshanassy street')
      expect(clean('524-542 Pacific Highway')).toBe('524-542 pacific highway')
    })

    it('reads units written in different ways', () => {
      expect(clean('Unit 3 39 New Canterbury Rd')).toBe('3/39 new canterbury road')
      expect(clean('U72 69 Milligan Street')).toBe('72/69 milligan street')
      expect(clean('U G1 355 king st')).toBe('g1/355 king street')
      expect(clean('Unit 2, 13 Fairlight Street')).toBe('2/13 fairlight street')
      expect(clean('Unit 708 No 5 Blanch St')).toBe('708/5 blanch street')
      expect(clean('11 8-10 Cowper Street')).toBe('11/8-10 cowper street')
      expect(clean('G03 266 Pitt St')).toBe('g03/266 pitt street')
      expect(clean('B/44 Enchanted Circuit')).toBe('b/44 enchanted circuit')
      expect(clean('9B 9B LLEWELLYN STREET')).toBe('9b llewellyn street')
    })

    it('takes off the locality typed after the street', () => {
      expect(clean('4/21 Maxwell Avenue, Edwardstown', ['edwardstown'])).toBe('4/21 maxwell avenue')
      expect(clean('U4 141 Riversdale Road Hawthorn 3122', ['hawthorn'])).toBe('4/141 riversdale road')
      expect(clean('6/85 Beatrice Terrace, Ascot QLD, Australia', ['ascot'])).toBe('6/85 beatrice terrace')
    })

    it('fixes small mistakes', () => {
      expect(clean('568 St.Kilda Rd')).toBe('568 st kilda road')
      expect(clean('6/29 Walton Cresent')).toBe('6/29 walton crescent')
      expect(clean('1/139 Jersey St N')).toBe('1/139 jersey street north')
      expect(clean('186 Broadway')).toBe('186 broadway')
      expect(clean('86 Waterfoot Loop')).toBe('86 waterfoot loop')
    })

    it('skips addresses it can’t place', () => {
      expect(clean('66 Ewart')).toBe('no street type')
      expect(clean('8 brokenwood ace')).toBe('no street type')
      expect(clean('Manningham Rd')).toBe('no street number')
      expect(clean('Units 1 & 2, 28-30 Sydney Road')).toBe('several units')
      expect(clean('Lot 1 Tangoa Rd')).toBe('lot number')
      expect(clean('261 OR 261A Oxford Street')).toBe('unclear address')
    })
  })

  describe('comment text', () => {
    it('links to the review', () => {
      expect(commentText('Mould in every room.', URL)).toBe(`Mould in every room.\n\n[View on ShitRentals →](${URL})`)
    })

    it('shortens long reviews to fit, at the end of a sentence', () => {
      const review = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the leaking roof.`).join(' ')
      const text = commentText(review, URL)
      expect(text.length).toBeLessThanOrEqual(COMMENT_MAX_LENGTH)
      expect(text).toMatch(/roof\.\n\n\[View more on ShitRentals →\]\(https:/)
      // Mid-sentence, it ends with "…"
      expect(commentText('word '.repeat(400), URL)).toMatch(/word…\n\n\[View more/)
    })

    it('ends with the link the extension takes off and shows as a button', () => {
      const url = 'https://airtable.com/app5nuiBfQvyyqojK/shrcYJ6DOxDdiBuDE/tblxFlCLXImh1mJZT/viw8OVdGvnj7I82ON/recABC'
      expect(splitReviewLink(commentText('Mould in every room.', url))).toEqual({
        text: 'Mould in every room.',
        url,
        shortened: false,
      })
      const long = splitReviewLink(commentText('word '.repeat(400), url))
      expect(long).toMatchObject({ url, shortened: true })
      expect(long?.text).toMatch(/word…$/)
    })

    it('shows the review as written, not as markdown', () => {
      expect(escapeMarkdown('*not* bold, __nor__ this <b>tag</b> [link](x)')).toBe(
        '\\*not\\* bold, \\_\\_nor\\_\\_ this \\<b\\>tag\\</b\\> \\[link\\](x)',
      )
      expect(escapeMarkdown('# not a heading')).toBe('\\# not a heading')
      // Lists stay lists
      expect(escapeMarkdown('1. Mould\n- Leaks')).toBe('1. Mould\n- Leaks')
    })
  })

  describe('reviews', () => {
    it('converts a review to a comment', () => {
      const result = parseRecord(
        record({ images: [{ id: 'att1', type: 'image/jpeg', width: 683, height: 512 }] }),
        index,
      )
      expect(result).toMatchObject({
        ok: true,
        comment: {
          id: 'sr_recABC',
          address: '18 gamble street',
          suburb: 'oakleigh',
          state: 'vic',
          postcode: '3166',
          username: 'ShitRentals',
          source: 'shitrentals',
          sourceId: 'recABC',
          createdAt: '2024-01-01T03:39:24.000Z',
          images: [{ id: 'att1', width: 683, height: 512 }],
        },
      })
    })

    it('keeps the first four images and no videos or other files', () => {
      const images = [
        'image/jpeg',
        'video/mp4',
        'image/png',
        'application/pdf',
        'image/heic',
        'image/webp',
        'image/jpeg',
      ]
      const result = parseRecord(
        record({ images: images.map((type, i) => ({ id: `att${i}`, type, width: 683, height: 512 })) }),
        index,
      )
      expect(result.ok && result.comment.images.map(image => image.id)).toEqual(['att0', 'att2', 'att4', 'att5'])
    })

    it('skips images Airtable has no thumbnail for', () => {
      const images = [
        { id: 'att0', type: 'image/heic' },
        { id: 'att1', type: 'image/jpeg', width: 683, height: 512 },
      ]
      const result = parseRecord(record({ images }), index)
      expect(result.ok && result.comment.images.map(image => image.id)).toEqual(['att1'])
    })

    it('skips reviews from outside Australia, and empty ones', () => {
      expect(parseRecord(record({ country: 'Aotearoa/New Zealand' }), index)).toMatchObject({
        ok: false,
        reason: 'not in Australia',
      })
      expect(parseRecord(record({ review: 'Anon' }), index)).toMatchObject({ ok: false, reason: 'review too short' })
    })

    it('applies overrides', () => {
      expect(parseRecord(record({ address: '66 Ewart' }), index, { address: '66 Ewart Street' })).toMatchObject({
        ok: true,
        comment: { address: '66 ewart street' },
      })
      expect(parseRecord(record(), index, { skip: 'asked to' })).toMatchObject({ ok: false, reason: 'override' })
    })
  })
})
