import { Markdown } from './Comment'
import { Dialog } from './Dialog'

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

// A small dialog explaining comment formatting
export function FormattingHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog id='rec-formatting-title' title='Formatting your comment' onClose={onClose}>
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
    </Dialog>
  )
}
