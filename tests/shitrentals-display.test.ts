// @vitest-environment jsdom
import type { CommentView } from '../src/shared/messages'

import { describe, expect, it } from 'vitest'

import { allCommentImages } from '../src/content/markdown'
import { hasImages, viewResults } from '../src/content/views'
import { shitRentalsImageUrl, splitReviewLink } from '../src/shared/shitrentals'

function comment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: 'c1',
    text: 'Mould in every room.',
    username: 'Anonymous',
    createdAt: 0,
    votes: 0,
    hasVoted: false,
    isOwn: false,
    canDelete: false,
    ...overrides,
  }
}

describe('ShitRentals reviews in the panel', () => {
  it('builds photo URLs on our image server from attachment IDs only', () => {
    expect(shitRentalsImageUrl('attPYUV3rwnBOTlHF')).toBe(
      'https://rec.cdn-steamgameidler.com/sr/attPYUV3rwnBOTlHF.webp',
    )
    expect(shitRentalsImageUrl('../evil')).toBeNull()
    expect(shitRentalsImageUrl('att123/../../x')).toBeNull()
    expect(shitRentalsImageUrl('https://example.com/a.jpg')).toBeNull()
  })

  it('shows a review’s photos before images linked in the text, four at most', () => {
    const photos = ['a', 'b', 'c'].map(id => `https://rec.cdn-steamgameidler.com/sr/att${id}0000000000.webp`)
    const images = allCommentImages({
      text: '[one](https://i.imgur.com/abc1234.jpg) [two](https://i.imgur.com/def5678.jpg)',
      photos,
    })
    expect(images.map(image => image.src)).toEqual([...photos, 'https://i.imgur.com/abc1234.jpg'])
    expect(hasImages(comment({ photos }))).toBe(true)
    expect(hasImages(comment())).toBe(false)
  })

  it('only takes off a link to the review on ShitRentals’ Airtable', () => {
    const text = 'Leaks.\n\n[View on ShitRentals →](https://evil.example/app5nuiBfQvyyqojK/x)'
    expect(splitReviewLink(text)).toBeNull()
    expect(splitReviewLink('Leaks. [View on ShitRentals →](https://airtable.com/app5nuiBfQvyyqojK/rec1)')).toBeNull()
  })

  it('filters search results by where their comments came from', () => {
    const ours = { comments: [comment()], latestAt: 1 }
    const theirs = { comments: [comment({ source: 'shitrentals' })], latestAt: 2 }
    const both = { comments: [comment(), comment({ source: 'shitrentals' })], latestAt: 3 }
    expect(viewResults([ours, theirs, both], 'community')).toEqual([ours, both])
    expect(viewResults([ours, theirs, both], 'shitrentals')).toEqual([theirs, both])
  })
})
