import type { CommentImage } from '../../shared/images'

import { createPortal } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalIcon } from './icons'

// Thumbnails of the images linked from a comment, under its text. Clicking one opens the lightbox. `xs` is the
// composer's preview.
export function CommentImages({ images, size }: { images: CommentImage[]; size?: 'xs' }) {
  const [failed, setFailed] = useState<string[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const gallery = useRef<HTMLDivElement>(null)
  const thumbnails = useRef<(HTMLButtonElement | null)[]>([])
  // An image that doesn't load (deleted, or blocked) is left out; its link is still in the text
  const visible = images.filter(image => !failed.includes(image.src))
  if (!visible.length) return null

  const close = (index: number) => {
    setOpen(null)
    thumbnails.current[index]?.focus()
  }

  // The lightbox covers the whole window, so it goes at the top of the shadow root rather than inside the panel
  const root = gallery.current?.getRootNode()
  return (
    <div class={`comment-images${size ? ` comment-images--${size}` : ''}`} ref={gallery}>
      {visible.map((image, index) => (
        <button
          key={image.src}
          ref={element => {
            thumbnails.current[index] = element
          }}
          type='button'
          class='comment-image'
          onClick={() => setOpen(index)}
          aria-label={image.alt ? `View image: ${image.alt}` : 'View image'}
          title={image.alt || 'View image'}
        >
          <img
            src={image.src}
            alt=''
            loading='lazy'
            decoding='async'
            referrerPolicy='no-referrer'
            onError={() => setFailed(current => [...current, image.src])}
          />
        </button>
      ))}
      {open !== null &&
        root instanceof ShadowRoot &&
        createPortal(<Lightbox images={visible} start={open} onClose={close} />, root)}
    </div>
  )
}

interface LightboxProps {
  images: CommentImage[]
  start: number
  // Called with the image showing when it closed, to return focus to its thumbnail
  onClose: (index: number) => void
}

function Lightbox({ images, start, onClose }: LightboxProps) {
  const [index, setIndex] = useState(start)
  const [error, setError] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const image = images[index]
  const several = images.length > 1

  useLayoutEffect(() => closeButton.current?.focus(), [])
  useEffect(() => setError(false), [index])
  if (!image) return null

  const step = (by: number) => setIndex(current => (current + by + images.length) % images.length)

  return (
    <div
      class='lightbox'
      role='dialog'
      aria-modal='true'
      aria-label={image.alt || 'Image'}
      // Never let a press on the backdrop start a text selection on the page (see the launcher in App)
      onMouseDown={event => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose(index)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          // Close only the lightbox, not the panel
          event.stopPropagation()
          onClose(index)
        } else if (several && event.key === 'ArrowLeft') step(-1)
        else if (several && event.key === 'ArrowRight') step(1)
      }}
    >
      <header class='lightbox-bar'>
        <span class='lightbox-count'>{several && `${index + 1} of ${images.length}`}</span>
        <a class='lightbox-button' href={image.href} target='_blank' rel='noopener noreferrer nofollow ugc'>
          <ExternalIcon />
          Open original
        </a>
        <button
          ref={closeButton}
          type='button'
          class='lightbox-button lightbox-button--icon'
          onClick={() => onClose(index)}
          aria-label='Close'
        >
          <CloseIcon />
        </button>
      </header>
      <figure
        class='lightbox-figure'
        onClick={event => {
          if (event.target === event.currentTarget) onClose(index)
        }}
      >
        {error ? (
          <p class='lightbox-error'>Couldn’t load this image. It may have been deleted.</p>
        ) : (
          <img
            key={image.src}
            class='lightbox-image'
            src={image.src}
            alt={image.alt}
            referrerPolicy='no-referrer'
            onError={() => setError(true)}
          />
        )}
        {image.alt && <figcaption>{image.alt}</figcaption>}
      </figure>
      {several && (
        <>
          <button
            type='button'
            class='lightbox-nav lightbox-nav--prev'
            onClick={() => step(-1)}
            aria-label='Previous image'
          >
            <ChevronLeftIcon size={28} />
          </button>
          <button type='button' class='lightbox-nav lightbox-nav--next' onClick={() => step(1)} aria-label='Next image'>
            <ChevronRightIcon size={28} />
          </button>
        </>
      )}
    </div>
  )
}
