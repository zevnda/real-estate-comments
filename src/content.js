import { parseAddressFromTitle } from './address-parser.js'
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
      const propertyLoaded = document.querySelector('title')
      if (propertyLoaded) {
        tryParseAddressWithRetry()
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

async function tryParseAddressWithRetry(attempts = 0) {
  const maxAttempts = 3
  const title = document.title
  const url = window.location.href

  const parsedAddress = parseAddressFromTitle(title, url)

  if (parsedAddress) {
    createCommentsPanel()
    return
  }

  if (attempts < maxAttempts - 1) {
    setTimeout(() => {
      tryParseAddressWithRetry(attempts + 1)
    }, 1000)
  } else {
  }
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
