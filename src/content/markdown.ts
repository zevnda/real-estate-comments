import type { CommentImage } from '../shared/images'

import DOMPurify from 'dompurify'
import { Marked } from 'marked'

import { findImages } from '../shared/images'

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    // Images are never embedded in the text. Markdown image syntax (![alt](url)) becomes a link instead, so it shows the
    // same as [alt](url): readable in the text, and a thumbnail under the comment if it's from a supported image host.
    image({ href, title, text, raw }) {
      return this.link({ type: 'link', raw, href, title, text: text.trim() || href, tokens: [], autolink: true })
    },
  },
})

const purify = DOMPurify(window)
purify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow ugc')
  }
})

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'del', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre']

// Renders comment markdown to sanitized DOM nodes. Comments are written by anyone, so everything outside the small
// allow-list (images, raw HTML, scripts, javascript: links, ...) is removed. Returning nodes instead of an HTML
// string means nothing is ever assigned to innerHTML.
export function renderMarkdown(text: string): DocumentFragment {
  try {
    const html = marked.parse(text) as string
    return purify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ['href', 'title'],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
      RETURN_DOM_FRAGMENT: true,
    })
  } catch {
    const fragment = document.createDocumentFragment()
    const paragraph = document.createElement('p')
    paragraph.textContent = text
    fragment.append(paragraph)
    return fragment
  }
}

// The images linked from a comment, shown as thumbnails under it. Taken from the rendered links, so only links that
// survive sanitizing count, and a URL inside `code` doesn't.
export function commentImages(text: string): CommentImage[] {
  const links = [...renderMarkdown(text).querySelectorAll('a[href]')].map(link => ({
    href: link.getAttribute('href') ?? '',
    text: link.textContent ?? '',
  }))
  return findImages(links)
}
