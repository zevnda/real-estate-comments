import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Configure marked with security settings
marked.setOptions({
  breaks: true,
  gfm: true,
  sanitize: false,
})

// Configure DOMPurify
const purifyConfig = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target', 'rel'],
}

// Create DOM elements from HTML string safely
function createElementsFromHTML(htmlString) {
  const cleanHtml = DOMPurify.sanitize(htmlString, purifyConfig)

  const parser = new DOMParser()
  const doc = parser.parseFromString(cleanHtml, 'text/html')

  const fragment = document.createDocumentFragment()
  Array.from(doc.body.childNodes).forEach(node => {
    const clonedNode = node.cloneNode(true)

    // Add target="_blank" and rel attributes to links
    if (clonedNode.nodeType === Node.ELEMENT_NODE) {
      const links = clonedNode.tagName === 'A' ? [clonedNode] : clonedNode.querySelectorAll('a')
      links.forEach(link => {
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
      })
    }

    fragment.appendChild(clonedNode)
  })

  return fragment
}

// Parse markdown to DOM elements
export function parseMarkdown(markdownText) {
  if (!markdownText) return document.createDocumentFragment()

  try {
    const html = marked.parse(markdownText)
    return createElementsFromHTML(html)
  } catch (error) {
    console.error('Error parsing markdown:', error)
    // Fallback to plain text with line breaks
    const fragment = document.createDocumentFragment()
    const lines = markdownText.split('\n')
    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.appendChild(document.createElement('br'))
      }
      fragment.appendChild(document.createTextNode(line))
    })
    return fragment
  }
}

// Validate markdown content (for comment validation)
export function validateMarkdownContent(text) {
  // Basic validation - you can extend this
  const lineCount = text.split('\n').length
  if (lineCount > 50) {
    return {
      valid: false,
      reason: 'Comment has too many lines. Maximum 50 lines allowed.',
    }
  }

  return { valid: true }
}
