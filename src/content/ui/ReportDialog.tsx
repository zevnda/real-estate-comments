import { useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from '../../shared/reports'
import { errorMessage } from '../hooks'
import { COMPLAINTS_EMAIL, complaintsMailto } from '../report'
import { Dialog } from './Dialog'

interface ReportDialogProps {
  commentId: string
  onClose: () => void
  onReported: () => void
}

// Reports a comment privately to the moderator. Replaces the public GitHub issue that 2.0.0 opened.
export function ReportDialog({ commentId, onClose, onReported }: ReportDialogProps) {
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooLong = details.trim().length > REPORT_DETAILS_MAX_LENGTH

  const send = async (event: Event) => {
    event.preventDefault()
    if (!reason || tooLong || sending) return
    setSending(true)
    setError(null)
    try {
      await callBackground('reportComment', { commentId, reason, details })
      setSent(true)
      onReported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Dialog id='rec-report-title' title='Thanks for reporting' class='report' onClose={onClose}>
        <p class='dialog-intro'>
          We’ll review this comment and remove it if it breaks the rules. We aim to review reports within 7 days.
        </p>
        <div class='terms-actions'>
          <button type='button' class='button button--primary' onClick={onClose} data-autofocus>
            Done
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog id='rec-report-title' title='Report this comment' class='report' onClose={onClose}>
      <form onSubmit={send}>
        <p class='dialog-intro'>Reports are private and go only to the moderator.</p>
        <fieldset class='report-reasons'>
          <legend>Why should it be removed?</legend>
          {REPORT_REASONS.map(option => (
            <label key={option.id} class='report-reason'>
              <input
                type='radio'
                name='rec-report-reason'
                value={option.id}
                checked={reason === option.id}
                onChange={() => setReason(option.id)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label class='report-details'>
          <span>Anything else we should know? (optional)</span>
          <textarea
            value={details}
            maxLength={REPORT_DETAILS_MAX_LENGTH}
            rows={3}
            placeholder='Please don’t repeat names or personal details'
            onInput={event => setDetails(event.currentTarget.value)}
          />
        </label>
        <p class='dialog-footnote'>
          For a legal complaint (defamation or privacy), you can also email{' '}
          <a href={complaintsMailto()}>{COMPLAINTS_EMAIL}</a>.
        </p>
        {error && (
          <p class='inline-error' role='alert'>
            {error}
          </p>
        )}
        <div class='terms-actions'>
          <button type='button' class='button button--ghost' onClick={onClose}>
            Cancel
          </button>
          <button type='submit' class='button button--primary' disabled={!reason || tooLong || sending}>
            {sending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
