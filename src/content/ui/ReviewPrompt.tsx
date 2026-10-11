import { useEffect, useState } from 'preact/hooks'

import { useStored } from '../hooks'
import { Dialog } from './Dialog'

// Asks once for a store review, from 30 minutes after install (or, for users who had it before this, after updating),
// the first time the panel is open after that. "Maybe later" asks again in a week; reviewing or "No thanks" stops it.
const ASK_AFTER_MS = 30 * 60 * 1000
const LATER_MS = 7 * 24 * 60 * 60 * 1000

const REVIEW_URLS = {
  chrome: 'https://chromewebstore.google.com/detail/fpmhogbiebniapjfkbhgeacgkgpjaenn/reviews',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/real-estate-comments/reviews/',
}

// Whether to ask now. `blocked` while another dialog (What's new) is showing.
export function useReviewPrompt(blocked: boolean) {
  const [installedAt, saveInstalledAt, installedLoaded] = useStored('installedAt', 0)
  // 'done', or a time (ms) before which not to ask again
  const [asked, saveAsked, askedLoaded] = useStored('reviewAsked', 0)
  const [now, setNow] = useState(Date.now)

  // In case the background didn't record it (e.g. installed before it did): start counting from now
  useEffect(() => {
    if (installedLoaded && !installedAt) saveInstalledAt(Date.now())
  }, [installedLoaded, installedAt])

  // If the panel is open when the time comes, ask then
  const due = asked === 'done' || !installedAt ? null : Math.max(installedAt + ASK_AFTER_MS, asked)
  useEffect(() => {
    if (due === null || due <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(due - now + 500, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [due, now])

  return {
    show: installedLoaded && askedLoaded && !blocked && due !== null && now >= due,
    later: () => saveAsked(Date.now() + LATER_MS),
    done: () => saveAsked('done'),
  }
}

export function ReviewDialog({ onLater, onDone }: { onLater: () => void; onDone: () => void }) {
  const firefox = navigator.userAgent.includes('Firefox')
  return (
    <Dialog id='rec-review-title' title='Enjoying Real Estate Comments?' class='review' onClose={onLater}>
      <p class='dialog-intro'>
        A quick review on the {firefox ? 'Firefox Add-ons site' : 'Chrome Web Store'} helps other renters and buyers
        find it. It takes a minute.
      </p>
      <div class='review-actions'>
        <button type='button' class='link-button' onClick={onDone}>
          No thanks
        </button>
        <button type='button' class='button button--ghost' onClick={onLater}>
          Maybe later
        </button>
        <a
          class='button button--primary'
          href={firefox ? REVIEW_URLS.firefox : REVIEW_URLS.chrome}
          target='_blank'
          rel='noopener noreferrer'
          onClick={onDone}
          data-autofocus
        >
          Leave a review
        </a>
      </div>
    </Dialog>
  )
}
