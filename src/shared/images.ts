// Which links in a comment are shown as image thumbnails. Only direct links to images on a few well-known public image
// hosts: every reader's browser loads these images, so an arbitrary URL would let a poster log readers' IP addresses
// or show content from a server nobody moderates. Album and gallery pages aren't supported, since finding their images
// needs the host's API; they stay ordinary links.

export interface CommentImage {
  // The image itself, loaded for the thumbnail and the lightbox
  src: string
  // The link as written in the comment (may be the host's page for the image), for "Open original"
  href: string
  // The link text, if it says something other than the URL
  alt: string
}

// Shown in the formatting help
export const IMAGE_HOST_NAMES = ['Imgur', 'ImgBB', 'Postimages', 'Flickr', 'Gyazo', 'imgbox', 'Reddit']

// Hosts that serve images directly at URLs ending in the file type
const DIRECT_HOSTS = new Set([
  'i.imgur.com',
  'i.ibb.co',
  'i.postimg.cc',
  'live.staticflickr.com',
  'i.gyazo.com',
  'images2.imgbox.com',
  'thumbs2.imgbox.com',
  'i.redd.it',
])

const IMGUR_PAGE_HOSTS = new Set(['imgur.com', 'www.imgur.com', 'm.imgur.com'])

const IMAGE_FILE = /\.(?:jpe?g|png|gif|webp|avif)$/i
// Imgur image IDs: 7 characters now, 5 for old uploads, with a digit or capital, which rules out pages like /upload
const IMGUR_ID = /^(?=.*[A-Z0-9])[a-zA-Z0-9]{5,7}$/

export const MAX_COMMENT_IMAGES = 4

// The direct image URL for a link, or null if it isn't a link to a single image on a supported host
export function imageUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname

  if (host === 'i.imgur.com') {
    // A bare ID (i.imgur.com/abc1234) still serves the image once given an extension; .gifv and .mp4 are videos
    const id = path.slice(1)
    if (IMGUR_ID.test(id)) return `https://i.imgur.com/${id}.jpg`
  }
  // An Imgur image page (imgur.com/abc1234) is the image at i.imgur.com. Albums (/a/…) and galleries (/gallery/…) aren't.
  if (IMGUR_PAGE_HOSTS.has(host)) {
    const id = path.replace(/\/$/, '').slice(1)
    return IMGUR_ID.test(id) ? `https://i.imgur.com/${id}.jpg` : null
  }

  if (!DIRECT_HOSTS.has(host) || !IMAGE_FILE.test(path)) return null
  // Always over HTTPS, and without the query string or hash (tracking parameters, sizes we don't need)
  return `https://${host}${path}`
}

// The images among a comment's links, in order, without repeats, at most MAX_COMMENT_IMAGES
export function findImages(links: { href: string; text: string }[]): CommentImage[] {
  const images: CommentImage[] = []
  for (const link of links) {
    const src = imageUrl(link.href)
    if (!src || images.some(image => image.src === src)) continue
    const text = link.text.trim()
    images.push({ src, href: link.href, alt: text === link.href || imageUrl(text) ? '' : text })
    if (images.length === MAX_COMMENT_IMAGES) break
  }
  return images
}
