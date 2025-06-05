import browserAPI from './browser-polyfill.js'
import { loadComments } from './components/comments.js'
import { createCommentsPanel } from './components/commentsPanel.js'
import { handleUrlChange, isPropertyPage } from './utils/utils.js'

// URL change detection
let lastUrl = window.location.href
function checkForUrlChanges() {
  if (lastUrl !== window.location.href) {
    lastUrl = window.location.href
    handleUrlChange(createCommentsPanel, loadComments)
  }
}

function observePageChanges() {
  setInterval(checkForUrlChanges, 500)

  const observer = new MutationObserver(function (mutations) {
    if (isPropertyPage() && !document.getElementById('property-comments-panel')) {
      const propertyLoaded = document.querySelector('.property-info, .listing-details, .property-features')
      if (propertyLoaded) {
        createCommentsPanel()
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

function initialize() {
  handleUrlChange(createCommentsPanel, loadComments)
  observePageChanges()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
