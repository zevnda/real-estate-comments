// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { commentImages } from '../src/content/markdown'
import { findImages, imageUrl, MAX_COMMENT_IMAGES } from '../src/shared/images'

describe('imageUrl', () => {
  it('accepts direct image links on supported hosts', () => {
    expect(imageUrl('https://i.imgur.com/abc1234.jpg')).toBe('https://i.imgur.com/abc1234.jpg')
    expect(imageUrl('https://i.imgur.com/abc1234.PNG')).toBe('https://i.imgur.com/abc1234.PNG')
    expect(imageUrl('https://i.ibb.co/x1y2z3/kitchen.jpg')).toBe('https://i.ibb.co/x1y2z3/kitchen.jpg')
    expect(imageUrl('https://i.postimg.cc/abcd/mould.webp')).toBe('https://i.postimg.cc/abcd/mould.webp')
    expect(imageUrl('https://live.staticflickr.com/65535/123_abc_b.jpg')).toBe(
      'https://live.staticflickr.com/65535/123_abc_b.jpg',
    )
    expect(imageUrl('https://i.redd.it/xyz.png')).toBe('https://i.redd.it/xyz.png')
  })

  it('turns Imgur image pages and bare IDs into the image', () => {
    expect(imageUrl('https://imgur.com/abc1234')).toBe('https://i.imgur.com/abc1234.jpg')
    expect(imageUrl('https://www.imgur.com/abc1234/')).toBe('https://i.imgur.com/abc1234.jpg')
    expect(imageUrl('https://m.imgur.com/aB3de')).toBe('https://i.imgur.com/aB3de.jpg')
    expect(imageUrl('https://i.imgur.com/abc1234')).toBe('https://i.imgur.com/abc1234.jpg')
  })

  it('leaves Imgur albums, galleries and videos as links', () => {
    expect(imageUrl('https://imgur.com/a/abc1234')).toBeNull()
    expect(imageUrl('https://imgur.com/gallery/abc1234')).toBeNull()
    expect(imageUrl('https://imgur.com/upload')).toBeNull()
    expect(imageUrl('https://imgur.com/privacy')).toBeNull()
    expect(imageUrl('https://i.imgur.com/abc1234.gifv')).toBeNull()
    expect(imageUrl('https://i.imgur.com/abc1234.mp4')).toBeNull()
  })

  it('upgrades to HTTPS and drops the query string', () => {
    expect(imageUrl('http://i.imgur.com/abc1234.jpg?tracking=1#x')).toBe('https://i.imgur.com/abc1234.jpg')
  })

  it('rejects other hosts, non-images and odd URLs', () => {
    expect(imageUrl('https://example.com/photo.jpg')).toBeNull()
    expect(imageUrl('https://i.imgur.com.evil.example/abc1234.jpg')).toBeNull()
    expect(imageUrl('https://evil.example/i.imgur.com/abc1234.jpg')).toBeNull()
    expect(imageUrl('https://ibb.co/x1y2z3')).toBeNull()
    expect(imageUrl('https://i.ibb.co/x1y2z3/page.html')).toBeNull()
    expect(imageUrl('https://user:pass@i.imgur.com/abc1234.jpg')).toBeNull()
    expect(imageUrl('https://i.imgur.com:8443/abc1234.jpg')).toBeNull()
    expect(imageUrl('javascript:alert(1)')).toBeNull()
    expect(imageUrl('not a url')).toBeNull()
  })
})

describe('findImages', () => {
  it('keeps the link text as the caption unless it is a URL', () => {
    expect(findImages([{ href: 'https://imgur.com/abc1234', text: 'Mould' }])).toEqual([
      { src: 'https://i.imgur.com/abc1234.jpg', href: 'https://imgur.com/abc1234', alt: 'Mould' },
    ])
    expect(findImages([{ href: 'https://imgur.com/abc1234', text: 'https://imgur.com/abc1234' }])[0]?.alt).toBe('')
  })

  it('drops repeats and caps the count', () => {
    const links = ['a', 'b', 'a', 'c', 'd', 'e', 'f'].map(id => ({
      href: `https://i.imgur.com/${id}0000.jpg`,
      text: id,
    }))
    const images = findImages(links)
    expect(images).toHaveLength(MAX_COMMENT_IMAGES)
    expect(images.map(image => image.alt)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('commentImages', () => {
  it('finds markdown links, bare URLs and image syntax', () => {
    const text =
      'See [the mould](https://i.imgur.com/aaaaaaa.jpg), https://imgur.com/bBb2bbb and ![](https://i.redd.it/c.png)'
    expect(commentImages(text).map(image => image.src)).toEqual([
      'https://i.imgur.com/aaaaaaa.jpg',
      'https://i.imgur.com/bBb2bbb.jpg',
      'https://i.redd.it/c.png',
    ])
  })

  it('ignores URLs in code and unsupported links', () => {
    expect(commentImages('`https://i.imgur.com/aaaaaaa.jpg` [x](https://example.com/a.jpg)')).toEqual([])
  })
})
