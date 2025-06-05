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

export function handleUrlChange(createCommentsPanel, loadComments) {
  if (isPropertyPage()) {
    if (!document.getElementById('property-comments-panel')) {
      createCommentsPanel()
    } else {
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
