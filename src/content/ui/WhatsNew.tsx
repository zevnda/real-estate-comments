import changelog from '../../../CHANGELOG.md'
import { ext } from '../../shared/ext'
import { Dialog } from './Dialog'
import { Markdown } from './Markdown'

// The current release's notes: CHANGELOG.md holds the entries for the version being built (see CLAUDE.md, Releasing)
export const CHANGES = changelog.trim()

// "What's new", shown once after an update and from the footer's Changelog link. Rendered by the same sanitising
// markdown code as comments.
export function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const version = ext.runtime.getManifest().version
  return (
    <Dialog id='rec-whats-new-title' title={`What’s new in version ${version}`} class='whats-new' onClose={onClose}>
      {CHANGES ? <Markdown text={CHANGES} /> : <p class='dialog-intro'>No notes for this version.</p>}
      <div class='terms-actions'>
        <button type='button' class='button button--primary' onClick={onClose} data-autofocus>
          Got it
        </button>
      </div>
    </Dialog>
  )
}
