import { useEffect, useRef, useState } from 'preact/hooks'

import { imageLinkProblem, imageUrl, UPLOAD_HOSTS } from '../../shared/images'
import { CloseIcon, ExternalIcon } from './icons'

// The comment box's image helper. Images aren't uploaded to us: the user uploads to an image host in a new tab, pastes
// the link back here, and it's checked before being added to the comment as a link (which shows as a thumbnail).
export function AddImage({ onAdd, onClose }: { onAdd: (markdown: string) => void; onClose: () => void }) {
  const [link, setLink] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const src = imageUrl(link.trim())
  const problem = imageLinkProblem(link)

  useEffect(() => input.current?.focus(), [])

  const add = () => {
    if (src) onAdd(`[Image](${link.trim()})`)
  }

  return (
    <div
      class='add-image'
      role='dialog'
      aria-label='Add an image'
      onKeyDown={event => {
        if (event.key === 'Escape') {
          // Close the helper, not the panel
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div class='add-image-header'>
        <strong>Add an image</strong>
        <button type='button' class='icon-button icon-button--small' onClick={onClose} aria-label='Close'>
          <CloseIcon />
        </button>
      </div>
      <ol class='add-image-steps'>
        <li>
          Upload it to one of the image hosts below
          <span class='add-image-hosts'>
            {UPLOAD_HOSTS.map(host => (
              <a key={host.name} href={host.url} target='_blank' rel='noopener noreferrer'>
                {host.name}
                <ExternalIcon />
              </a>
            ))}
          </span>
        </li>
        <li>
          Copy the image’s link and paste it here:
          <span class='add-image-field'>
            <input
              ref={input}
              type='url'
              value={link}
              placeholder='https://i.imgur.com/…'
              aria-label='Image link'
              aria-invalid={!!problem}
              onInput={event => setLink(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  add()
                }
              }}
            />
            <button type='button' class='button button--primary' onClick={add} disabled={!src}>
              Add
            </button>
          </span>
        </li>
      </ol>
      {src ? (
        <p class='add-image-status add-image-status--ok'>
          <img src={src} alt='' referrerPolicy='no-referrer' />
          That works. It’ll show as a thumbnail under your comment.
        </p>
      ) : (
        problem && <p class='add-image-status inline-error'>{problem}</p>
      )}
    </div>
  )
}
