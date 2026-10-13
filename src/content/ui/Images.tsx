import type { CommentImage } from '../../shared/images'
import type { Point, View } from '../zoom'

import { createPortal } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

import {
  clampView,
  distance,
  MAX_SCALE,
  midpoint,
  MIN_SCALE,
  NO_ZOOM,
  swipeAction,
  TAP_SCALE,
  zoomAround,
} from '../zoom'
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

  const step = (by: number) => setIndex(current => (current + by + images.length) % images.length)
  const zoom = useZoom(
    index,
    action => (action === 'close' ? onClose(index) : step(action === 'next' ? 1 : -1)),
    several,
  )

  useLayoutEffect(() => closeButton.current?.focus(), [])
  useEffect(() => setError(false), [index])
  if (!image) return null

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
            ref={zoom.ref}
            class={`lightbox-image${zoom.view.scale > 1 ? ' lightbox-image--zoomed' : ''}`}
            src={image.src}
            alt={image.alt}
            referrerPolicy='no-referrer'
            draggable={false}
            title='Pinch, double-click or scroll to zoom'
            style={zoom.style}
            onError={() => setError(true)}
            {...zoom.handlers}
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

type Gesture =
  | { kind: 'pinch'; start: View; from: Point; distance: number }
  | { kind: 'pan'; start: View; from: Point }
  | { kind: 'swipe'; from: Point }

type SwipeAction = 'next' | 'previous' | 'close'

// Pinch, double-tap/double-click and wheel zoom, dragging when zoomed, and (touch, unzoomed) swiping to the next or
// previous image or down to close. Reset whenever the image changes. The maths is in zoom.ts.
function useZoom(resetKey: number, onSwipe: (action: SwipeAction) => void, canStep: boolean) {
  const ref = useRef<HTMLImageElement>(null)
  const [view, setView] = useState<View>(NO_ZOOM)
  // How far a swipe has moved, so the image follows the finger
  const [drag, setDrag] = useState<Point | null>(null)
  const [moving, setMoving] = useState(false)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const tap = useRef({ at: 0, x: 0, y: 0, down: 0, startX: 0, startY: 0 })

  useEffect(() => {
    setView(NO_ZOOM)
    setDrag(null)
  }, [resetKey])

  // A screen position relative to the image's untransformed centre (the transform scales around the centre, so the
  // centre only moves by the translation)
  const local = (clientX: number, clientY: number): Point => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clientX - (rect.left + rect.width / 2 - view.x),
      y: clientY - (rect.top + rect.height / 2 - view.y),
    }
  }
  const apply = (next: View) =>
    setView(clampView(next, { width: ref.current?.offsetWidth ?? 0, height: ref.current?.offsetHeight ?? 0 }))
  const limit = (scale: number) => Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE)

  // Starts a pinch (two fingers) or a drag (one finger, zoomed in) from the pointers now down
  const begin = (current: View) => {
    const [a, b] = [...pointers.current.values()]
    if (a && b) gesture.current = { kind: 'pinch', start: current, from: midpoint(a, b), distance: distance(a, b) }
    else if (a && current.scale > 1) gesture.current = { kind: 'pan', start: current, from: a }
    else gesture.current = null
  }

  const end = (event: PointerEvent, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return
    const current = gesture.current
    if (current?.kind === 'swipe' && !cancelled) {
      const action = swipeAction(event.clientX - current.from.x, event.clientY - current.from.y)
      if (action && (action === 'close' || canStep)) onSwipe(action)
    }
    setDrag(null)
    // A quick press that didn't move is a tap; two close together toggle the zoom
    const t = tap.current
    const still = Math.hypot(event.clientX - t.startX, event.clientY - t.startY) < 10 && Date.now() - t.down < 300
    if (!cancelled && still && pointers.current.size === 0) {
      const now = Date.now()
      if (now - t.at < 350 && Math.hypot(event.clientX - t.x, event.clientY - t.y) < 30) {
        apply(view.scale > 1 ? NO_ZOOM : zoomAround(view, TAP_SCALE, local(event.clientX, event.clientY)))
        t.at = 0
      } else {
        Object.assign(t, { at: now, x: event.clientX, y: event.clientY })
      }
    }
    // Lifting one finger of a pinch carries on as a drag with the other
    if (pointers.current.size) begin(view)
    else {
      gesture.current = null
      setMoving(false)
    }
  }

  const handlers = {
    onPointerDown: (event: PointerEvent) => {
      event.preventDefault()
      ref.current?.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, local(event.clientX, event.clientY))
      Object.assign(tap.current, { down: Date.now(), startX: event.clientX, startY: event.clientY })
      setMoving(true)
      begin(view)
      // Swiping is for touch: with a mouse, dragging an unzoomed image would too easily change it by accident
      if (!gesture.current && pointers.current.size === 1 && event.pointerType !== 'mouse') {
        gesture.current = { kind: 'swipe', from: { x: event.clientX, y: event.clientY } }
      }
    },
    onPointerMove: (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return
      const point = local(event.clientX, event.clientY)
      pointers.current.set(event.pointerId, point)
      const current = gesture.current
      if (current?.kind === 'pinch') {
        const [a, b] = [...pointers.current.values()]
        if (!a || !b) return
        const scale = limit((current.start.scale * distance(a, b)) / current.distance)
        apply(zoomAround(current.start, scale, current.from, midpoint(a, b)))
      } else if (current?.kind === 'pan') {
        apply({
          ...current.start,
          x: current.start.x + point.x - current.from.x,
          y: current.start.y + point.y - current.from.y,
        })
      } else if (current?.kind === 'swipe') {
        // Sideways, or down (towards closing); never up
        setDrag({ x: event.clientX - current.from.x, y: Math.max(0, event.clientY - current.from.y) })
      }
    },
    onPointerUp: (event: PointerEvent) => end(event, false),
    onPointerCancel: (event: PointerEvent) => end(event, true),
    onWheel: (event: WheelEvent) => {
      event.preventDefault()
      apply(zoomAround(view, limit(view.scale * Math.exp(-event.deltaY * 0.002)), local(event.clientX, event.clientY)))
    },
  }

  const offset = drag ?? { x: 0, y: 0 }
  const style = {
    transform: `translate(${view.x + offset.x}px, ${view.y + offset.y}px) scale(${view.scale})`,
    // Follow fingers exactly while they move, and ease into place after
    transition: moving ? 'none' : 'transform 0.2s ease-out',
    // Fades as it's swiped down, towards closing
    opacity: drag ? Math.max(0.4, 1 - drag.y / 400) : 1,
  }
  return { ref, view, style, handlers }
}
