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

// Parse markdown to HTML
export function parseMarkdown(markdownText) {
  if (!markdownText) return ''

  try {
    const html = marked.parse(markdownText)

    // Sanitize with DOMPurify and ensure links open in new tab
    const cleanHtml = DOMPurify.sanitize(html, purifyConfig)

    // Add target="_blank" and rel="noopener noreferrer" to links
    return cleanHtml.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
  } catch (error) {
    console.error('Error parsing markdown:', error)
    // Fallback to plain text with line breaks
    return markdownText.replace(/\n/g, '<br>')
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
