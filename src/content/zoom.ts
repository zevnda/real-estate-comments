// Zooming and swiping in the image lightbox. The image is drawn with `translate(x, y) scale(scale)` around its centre;
// points are in pixels relative to the image's untransformed centre.

export interface View {
  scale: number
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

export const MIN_SCALE = 1
export const MAX_SCALE = 4
// Double-tap or double-click zooms to this
export const TAP_SCALE = 2.5
export const NO_ZOOM: View = { scale: 1, x: 0, y: 0 }

// How far a touch must travel to count as a swipe
const SWIPE_DISTANCE = 60
const CLOSE_DISTANCE = 110

// Keeps the zoomed image covering its own frame: it can't be dragged off so far that blank space shows on a side
export function clampView(view: View, size: { width: number; height: number }): View {
  const scale = Math.min(Math.max(view.scale, MIN_SCALE), MAX_SCALE)
  const maxX = (size.width * (scale - 1)) / 2
  const maxY = (size.height * (scale - 1)) / 2
  return {
    scale,
    x: Math.min(Math.max(view.x, -maxX), maxX),
    y: Math.min(Math.max(view.y, -maxY), maxY),
  }
}

// Zooms to `scale` keeping `from` (where the fingers or cursor started, relative to the centre) under `to` (where they
// are now), so the spot being pinched stays put and moving the fingers pans
export function zoomAround(start: View, scale: number, from: Point, to: Point = from): View {
  const ratio = scale / start.scale
  return { scale, x: to.x - ratio * (from.x - start.x), y: to.y - ratio * (from.y - start.y) }
}

// What a finished one-finger drag on an unzoomed image means
export function swipeAction(dx: number, dy: number): 'next' | 'previous' | 'close' | null {
  if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'next' : 'previous'
  if (dy > CLOSE_DISTANCE && dy > Math.abs(dx)) return 'close'
  return null
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
