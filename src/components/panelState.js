export function handleOutsideClick(e) {
  const panel = document.getElementById('property-comments-panel')
  const bubble = document.getElementById('property-comments-bubble')
  const backdrop = document.getElementById('panel-backdrop')
  const tosModal = document.getElementById('tos-modal')
  const recentsModal = document.getElementById('recent-comments-modal')
  if (!panel || !bubble) return

  // Check if click is outside panel and panel is expanded
  // Exclude ToS modal and recents modal from triggering panel hide
  // Also hide panel when backdrop is clicked
  if (
    (!panel.contains(e.target) &&
      !bubble.contains(e.target) &&
      (!tosModal || !tosModal.contains(e.target)) &&
      (!recentsModal || !recentsModal.contains(e.target)) &&
      panel.classList.contains('expanded')) ||
    (backdrop && e.target === backdrop)
  ) {
    hideCommentsPanel()
  }
}

function createBackdrop() {
  if (document.getElementById('panel-backdrop')) return

  const backdrop = document.createElement('div')
  backdrop.id = 'panel-backdrop'
  backdrop.className = 'panel-backdrop'
  document.body.appendChild(backdrop)
}

function showBackdrop() {
  createBackdrop()
  const backdrop = document.getElementById('panel-backdrop')
  if (backdrop) {
    backdrop.classList.add('visible')
  }
}

function hideBackdrop() {
  const backdrop = document.getElementById('panel-backdrop')
  if (backdrop) {
    backdrop.classList.remove('visible')
  }
}

export function showCommentsPanel() {
  const panel = document.getElementById('property-comments-panel')
  const bubble = document.getElementById('property-comments-bubble')
  if (panel) {
    panel.classList.remove('minimized')
    panel.classList.add('expanded')
    localStorage.setItem('comments-panel-state', 'expanded')
    updatePanelAndBubbleVisibility()
    showBackdrop()
    // Add click listener when showing
    document.addEventListener('click', handleOutsideClick)
  }
  if (bubble) bubble.style.opacity = '0'
}

export function hideCommentsPanel() {
  const panel = document.getElementById('property-comments-panel')
  const bubble = document.getElementById('property-comments-bubble')
  if (panel) {
    panel.classList.remove('expanded')
    panel.classList.add('minimized')
    localStorage.setItem('comments-panel-state', 'minimized')
    updatePanelAndBubbleVisibility()
    hideBackdrop()
    // Remove click listener when hiding
    document.removeEventListener('click', handleOutsideClick)
  }
  if (bubble) bubble.style.display = ''
}

export function toggleCommentsPanel() {
  const panel = document.getElementById('property-comments-panel')
  if (!panel) return
  if (panel.classList.contains('expanded')) {
    hideCommentsPanel()
  } else {
    showCommentsPanel()
  }
}

export function updatePanelAndBubbleVisibility() {
  const panel = document.getElementById('property-comments-panel')
  const bubble = document.getElementById('property-comments-bubble')
  if (!panel || !bubble) return

  if (panel.classList.contains('expanded')) {
    panel.style.visibility = ''
    bubble.style.opacity = '0'
    bubble.classList.remove('visible')
    showBackdrop()
  } else {
    panel.style.visibility = ''
    bubble.style.opacity = '1'
    bubble.classList.add('visible')
    hideBackdrop()
  }
}

export function restorePanelState() {
  const panel = document.getElementById('property-comments-panel')
  const bubble = document.getElementById('property-comments-bubble')
  const savedState = localStorage.getItem('comments-panel-state')
  if (!panel || !bubble) return

  if (savedState === 'minimized') {
    panel.classList.remove('expanded')
    panel.classList.add('minimized')
    hideBackdrop()
    document.removeEventListener('click', handleOutsideClick)
  } else {
    panel.classList.remove('minimized')
    panel.classList.add('expanded')
    showBackdrop()
    document.addEventListener('click', handleOutsideClick)
  }
  updatePanelAndBubbleVisibility()
}
