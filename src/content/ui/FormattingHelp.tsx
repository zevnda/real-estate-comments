import { useEffect, useRef } from 'preact/hooks'

import { Markdown } from './Comment'
import { CloseIcon } from './icons'

// What you type → how it shows. Results are rendered by the same code as real comments, so they can't drift.
const EXAMPLES: { label: string; source: string; note?: string }[] = [
  { label: 'Bold', source: '**Great** landlord' },
  { label: 'Italic', source: 'Rent was *very* fair' },
  { label: 'Strikethrough', source: '~~Quiet~~ street' },
  { label: 'Link', source: '[Council report](https://example.com)' },
  { label: 'Quote', source: '> Agent said repairs were done' },
  { label: 'List', source: '- Mould in bathroom\n- Leaky tap' },
  { label: 'Numbered list', source: '1. Inspected\n2. Applied' },
  { label: 'Code', source: 'Gate code `1234`' },
  // Images can't be shown in comments (they're stripped for safety), so link to one instead
  {
    label: 'Image',
    source: '[Photo of the mould](https://i.imgur.com/abc123.jpg)',
    note: 'Upload it to Imgur or another image host, then link to it',
  },
]

// A small dialog over the panel explaining comment formatting. Closes on the backdrop, the close button or Esc.
export function FormattingHelp({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => closeButton.current?.focus(), [])

  return (
    <div
      class='overlay'
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          // Close only this dialog, not the whole panel
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div class='dialog' role='dialog' aria-modal='true' aria-labelledby='rec-formatting-title'>
        <header class='dialog-header'>
          <h3 id='rec-formatting-title'>Formatting your comment</h3>
          <button ref={closeButton} type='button' class='icon-button' onClick={onClose} aria-label='Close'>
            <CloseIcon />
          </button>
        </header>
        <p class='dialog-intro'>Comments support Markdown. Line breaks are kept as you type them.</p>
        <table class='formatting-table'>
          <thead>
            <tr>
              <th scope='col'>You type</th>
              <th scope='col'>You get</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map(example => (
              <tr key={example.label}>
                <td>
                  <span class='formatting-label'>{example.label}</span>
                  <code class='formatting-source'>{example.source}</code>
                  {example.note && <span class='formatting-note'>{example.note}</span>}
                </td>
                <td>
                  <Markdown text={example.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class='dialog-footnote'>
          Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to post. HTML isn’t supported.
        </p>
      </div>
    </div>
  )
}
