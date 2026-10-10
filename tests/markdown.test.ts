// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { formatRelative, initials } from '../src/content/format'
import { renderMarkdown } from '../src/content/markdown'

function html(text: string): string {
  const div = document.createElement('div')
  div.append(renderMarkdown(text))
  return div.innerHTML.trim()
}

describe('renderMarkdown', () => {
  it('renders basic formatting', () => {
    expect(html('**bold** and *italic*')).toBe('<p><strong>bold</strong> and <em>italic</em></p>')
    expect(html('- one\n- two')).toContain('<li>one</li>')
  })

  it('opens links in a new tab without leaking the opener', () => {
    expect(html('[site](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow ugc">site</a></p>',
    )
  })

  it('strips scripts, images, event handlers and javascript: links', () => {
    const output = html(
      '<script>alert(1)</script><img src=x onerror=alert(1)> [x](javascript:alert(1)) <b onclick="alert(1)">b</b>',
    )
    expect(output).not.toMatch(/<script|<img|onerror|onclick|href="javascript/i)
  })
})

describe('format', () => {
  it('formats relative times', () => {
    const now = Date.UTC(2026, 5, 1)
    expect(formatRelative(now - 10_000, now)).toBe('just now')
    expect(formatRelative(now - 3 * 60 * 60 * 1000, now)).toBe('3 hours ago')
    expect(formatRelative(now - 24 * 60 * 60 * 1000, now)).toBe('yesterday')
  })

  it('builds initials', () => {
    expect(initials('jane doe')).toBe('JD')
    expect(initials('Anonymous')).toBe('A')
  })
})
