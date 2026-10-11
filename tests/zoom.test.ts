import { describe, expect, it } from 'vitest'

import { clampView, MAX_SCALE, NO_ZOOM, swipeAction, zoomAround } from '../src/content/zoom'

const size = { width: 400, height: 300 }

describe('clampView', () => {
  it('limits the zoom and keeps the image covering its frame', () => {
    expect(clampView({ scale: 10, x: 0, y: 0 }, size).scale).toBe(MAX_SCALE)
    expect(clampView({ scale: 0.5, x: 50, y: 50 }, size)).toEqual(NO_ZOOM)
    // At 2× the image is 800 × 600, so it can move 200 × 150 each way
    expect(clampView({ scale: 2, x: 999, y: -999 }, size)).toEqual({ scale: 2, x: 200, y: -150 })
  })
})

describe('zoomAround', () => {
  it('keeps the pinched spot under the fingers', () => {
    const point = { x: 100, y: -50 }
    const view = zoomAround(NO_ZOOM, 2, point)
    // The image point that was under the fingers: (point - translation) / scale
    expect({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }).toEqual(point)
  })

  it('pans by how far the fingers move', () => {
    const view = zoomAround({ scale: 2, x: 0, y: 0 }, 2, { x: 0, y: 0 }, { x: 30, y: -20 })
    expect(view).toEqual({ scale: 2, x: 30, y: -20 })
  })
})

describe('swipeAction', () => {
  it('goes to the next or previous image on a sideways swipe, and closes on a swipe down', () => {
    expect(swipeAction(-100, 10)).toBe('next')
    expect(swipeAction(100, -10)).toBe('previous')
    expect(swipeAction(10, 150)).toBe('close')
  })

  it('ignores small or upward movements', () => {
    expect(swipeAction(30, 0)).toBeNull()
    expect(swipeAction(0, -200)).toBeNull()
    // Diagonal: too steep for a swipe, too short to close
    expect(swipeAction(80, 90)).toBeNull()
  })
})
