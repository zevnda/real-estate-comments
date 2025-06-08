import { restorePanelState } from '../components/commentsPanel'

// Simple browser API compatibility
export const getBrowserAPI = () => {
  if (typeof browser !== 'undefined' && (browser.storage || browser.runtime)) {
    return browser
  }
  return chrome
}

export function isPropertyPage() {
  const url = window.location.href
  const isRealEstate = url.includes('realestate.com.au/property-') || url.includes('realestate.com.au/property/')

  // Domain property URLs follow pattern domain.com.au/address-suburb-state-postcode-propertyid
  const isDomain = url.includes('domain.com.au/') && url.match(/domain\.com\.au\/[^\/]+-\d+(\?|$)/) !== null

  // Domain property-profile URLs follow pattern domain.com.au/property-profile/address-suburb-state-postcode
  const isDomainProfile = url.includes('domain.com.au/property-profile/')

  return isRealEstate || isDomain || isDomainProfile
}

export function isSupportedDomain() {
  const url = window.location.href
  return url.includes('realestate.com.au') || url.includes('domain.com.au')
}

export function handleUrlChange(createCommentsPanel, loadComments) {
  if (isSupportedDomain()) {
    if (!document.getElementById('property-comments-panel')) {
      createCommentsPanel()
    } else if (isPropertyPage()) {
      loadComments()
    }
    if (!document.getElementById('property-comments-bubble')) {
      createCommentsPanel()
    }
    restorePanelState()
  } else {
    const panel = document.getElementById('property-comments-panel')
    if (panel) panel.remove()
    const bubble = document.getElementById('property-comments-bubble')
    if (bubble) bubble.remove()
    const backdrop = document.getElementById('panel-backdrop')
    if (backdrop) backdrop.remove()
  }
}

export function createSVGElement(path, vbWidth = 512, viewBoxHeight = 512) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path')

  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('viewBox', `0 0 ${vbWidth} ${viewBoxHeight}`)
  svg.setAttribute('width', '32')
  svg.setAttribute('height', '32')
  svg.setAttribute('fill', 'white')

  pathElement.setAttribute('d', path)
  svg.appendChild(pathElement)

  return svg
}

export function initPanelResize() {
  const panel = document.getElementById('property-comments-panel')
  if (!panel) return

  // Dimensions are now applied in createCommentsPanel before DOM insertion
  // Add resize handles
  addResizeHandles(panel)
}

function addResizeHandles(panel) {
  // Minimum dimensions
  const MIN_WIDTH = 800
  const MIN_HEIGHT = 500

  // Create resize handles - only for top and left resizing
  const handles = ['nw', 'n', 'w']

  handles.forEach(direction => {
    const handle = document.createElement('div')
    handle.className = `resize-handle resize-${direction}`
    handle.dataset.direction = direction
    panel.appendChild(handle)

    let isResizing = false
    let startX, startY, startWidth, startHeight, startRight, startBottom

    handle.addEventListener('mousedown', e => {
      e.preventDefault()
      e.stopPropagation()

      isResizing = true
      startX = e.clientX
      startY = e.clientY

      const rect = panel.getBoundingClientRect()
      startWidth = rect.width
      startHeight = rect.height
      startRight = window.innerWidth - rect.right
      startBottom = window.innerHeight - rect.bottom

      document.body.style.cursor = getResizeCursor(direction)
      document.body.style.userSelect = 'none'

      const handleMouseMove = e => {
        if (!isResizing) return

        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY

        let newWidth = startWidth
        let newHeight = startHeight
        let newRight = startRight
        let newBottom = startBottom

        // Calculate new dimensions based on handle direction
        if (direction.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth * 0.9, startWidth - deltaX))
        }
        if (direction.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight * 0.9, startHeight - deltaY))
        }

        // Apply new dimensions
        panel.style.width = `${newWidth}px`
        panel.style.height = `${newHeight}px`
        panel.style.minHeight = `${newHeight}px`
        panel.style.maxHeight = `${newHeight}px`
        panel.style.right = `${newRight}px`
        panel.style.bottom = `${newBottom}px`
      }

      const handleMouseUp = () => {
        if (isResizing) {
          isResizing = false
          document.body.style.cursor = ''
          document.body.style.userSelect = ''

          // Save dimensions
          const rect = panel.getBoundingClientRect()
          localStorage.setItem('comments-panel-width', `${rect.width}px`)
          localStorage.setItem('comments-panel-height', `${rect.height}px`)

          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
        }
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    })
  })
}

function getResizeCursor(direction) {
  const cursors = {
    n: 'n-resize',
    s: 's-resize',
    e: 'e-resize',
    w: 'w-resize',
    ne: 'ne-resize',
    nw: 'nw-resize',
    se: 'se-resize',
    sw: 'sw-resize',
  }
  return cursors[direction] || 'default'
}
