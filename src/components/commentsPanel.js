import { initPanelResize, isPropertyPage, isSupportedDomain } from '../utils/utils.js'
import { loadComments, submitComment } from './comments.js'
import { createToSModal } from './modal.js'
import { handleOutsideClick, hideCommentsPanel, updatePanelAndBubbleVisibility } from './panelState.js'
import { createCommentsBubble, createPanelBody, createPanelHeader, createRecentCommentsBody } from './panelUI.js'
import { createRecentCommentsModal, showRecentCommentsInPanel, showRecentCommentsModal } from './recentComments.js'

// Re-export functions for external use
export {
  handleOutsideClick,
  showCommentsPanel,
  hideCommentsPanel,
  toggleCommentsPanel,
  updatePanelAndBubbleVisibility,
  restorePanelState,
} from './panelState.js'

export { showToSModal, hasAcceptedToS } from './modal.js'

// Create and inject the comments panel
export function createCommentsPanel() {
  // Check if panel already exists
  if (document.getElementById('property-comments-panel')) {
    return
  }
  // Only create panel if we're on a supported domain
  if (!isSupportedDomain()) {
    return
  }

  // Create floating bubble
  createCommentsBubble()

  // Create floating main panel
  const panel = document.createElement('div')
  panel.id = 'property-comments-panel'

  // Check saved states before assigning class
  const savedState = localStorage.getItem('comments-panel-state')
  panel.className =
    savedState === 'minimized' ? 'property-comments-floating minimized' : 'property-comments-floating expanded'

  // Apply saved dimensions BEFORE adding to DOM
  const savedWidth = localStorage.getItem('comments-panel-width')
  const savedHeight = localStorage.getItem('comments-panel-height')

  if (savedWidth) {
    panel.style.width = savedWidth
  }

  if (savedHeight) {
    panel.style.height = savedHeight
    panel.style.minHeight = savedHeight
    panel.style.maxHeight = savedHeight
  }

  // Create panel components based on page type
  const header = createPanelHeader()
  const body = isPropertyPage() ? createPanelBody() : createRecentCommentsBody()

  panel.appendChild(header)
  panel.appendChild(body)

  document.body.appendChild(panel)

  // Create backdrop element
  if (!document.getElementById('panel-backdrop')) {
    const backdrop = document.createElement('div')
    backdrop.id = 'panel-backdrop'
    backdrop.className = 'panel-backdrop'
    document.body.appendChild(backdrop)
  }

  // Create ToS modal
  createToSModal()

  // Create recent comments modal (only for property pages)
  if (isPropertyPage()) {
    createRecentCommentsModal()
  }

  // Add click listener if panel starts expanded
  if (!panel.classList.contains('minimized')) {
    document.addEventListener('click', handleOutsideClick)
  }

  // Initialize immediately without setTimeout
  const submitBtn = document.getElementById('submit-comment-btn')
  const closeBtn = document.querySelector('.panel-close-btn')
  const recentCommentsBtn = document.querySelector('.recent-comments-btn')

  if (submitBtn) {
    submitBtn.addEventListener('click', submitComment)
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', hideCommentsPanel)
  }

  if (recentCommentsBtn) {
    recentCommentsBtn.addEventListener('click', showRecentCommentsModal)
  }

  // Add character counter logic (only for property pages)
  if (isPropertyPage()) {
    const textarea = document.getElementById('new-comment')
    const charCounter = document.querySelector('.char-counter')
    if (textarea && charCounter) {
      textarea.addEventListener('input', () => {
        const count = textarea.value.length
        charCounter.textContent = `${count}/1200 characters`
        charCounter.style.color = count > 1200 ? '#d32f2f' : '#5f6368'
      })
    }
  }

  // Initialize resize functionality
  initPanelResize()

  // Show/hide panel or bubble based on state
  updatePanelAndBubbleVisibility()

  // Load appropriate content
  if (isPropertyPage()) {
    loadComments()
  } else {
    showRecentCommentsInPanel()
  }
}
