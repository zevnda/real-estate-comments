import browserAPI from '../browser-polyfill.js'
import { createSVGElement } from '../utils/utils.js'

export function createRecentCommentsModal() {
  // Check if modal already exists
  if (document.getElementById('recent-comments-modal')) {
    return
  }

  const modal = document.createElement('div')
  modal.id = 'recent-comments-modal'
  modal.className = 'recent-comments-modal'
  modal.style.display = 'none'

  const modalContent = document.createElement('div')
  modalContent.className = 'recent-comments-modal-content'

  const header = document.createElement('div')
  header.className = 'recent-comments-header'

  const title = document.createElement('h3')
  title.textContent = 'Recent Comments'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'panel-close-btn'
  const closeSvg = createSVGElement(
    'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z',
  )
  closeBtn.appendChild(closeSvg)

  header.appendChild(title)
  header.appendChild(closeBtn)

  const content = document.createElement('div')
  content.className = 'recent-comments-content'

  const loadingDiv = document.createElement('div')
  loadingDiv.className = 'recent-comments-loading'
  loadingDiv.textContent = 'Loading recent comments...'
  content.appendChild(loadingDiv)

  modalContent.appendChild(header)
  modalContent.appendChild(content)
  modal.appendChild(modalContent)

  document.body.appendChild(modal)

  // Add event listeners
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none'
  })

  // Close modal when clicking outside
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.style.display = 'none'
    }
  })

  return modal
}

export function showRecentCommentsModal() {
  const modal = document.getElementById('recent-comments-modal')
  if (!modal) {
    createRecentCommentsModal()
  }

  const modalToShow = document.getElementById('recent-comments-modal')
  modalToShow.style.display = 'flex'
  loadRecentComments()
}

async function loadRecentComments() {
  const content = document.querySelector('.recent-comments-content')
  if (!content) return

  // Show loading state
  while (content.firstChild) {
    content.removeChild(content.firstChild)
  }
  const loadingDiv = document.createElement('div')
  loadingDiv.className = 'recent-comments-loading'
  loadingDiv.textContent = 'Loading recent comments...'
  content.appendChild(loadingDiv)

  try {
    const response = await browserAPI.runtime.sendMessage({
      action: 'getRecentComments',
    })

    if (response.error) {
      while (content.firstChild) {
        content.removeChild(content.firstChild)
      }
      const errorDiv = document.createElement('div')
      errorDiv.className = 'recent-comments-error'
      errorDiv.textContent = `Error loading comments: ${response.error}`
      content.appendChild(errorDiv)
      return
    }

    if (response.isEmpty || !response.comments || response.comments.length === 0) {
      while (content.firstChild) {
        content.removeChild(content.firstChild)
      }
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'recent-comments-empty'
      emptyDiv.textContent = 'No recent comments found.'
      content.appendChild(emptyDiv)
      return
    }

    // Clear content and add comments
    while (content.firstChild) {
      content.removeChild(content.firstChild)
    }

    response.comments.forEach(comment => {
      const commentElement = document.createElement('div')
      commentElement.className = 'recent-comment-item'

      const date = new Date(comment.timestamp)
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString()

      const commentHeader = document.createElement('div')
      commentHeader.className = 'recent-comment-header'

      const locationInfo = document.createElement('div')
      locationInfo.className = 'recent-comment-location'
      const locationText = `${comment.address}, ${comment.suburb}`
      if (comment.url) {
        const locationLink = document.createElement('a')
        locationLink.href = comment.url
        locationLink.target = '_blank'
        locationLink.textContent = locationText
        locationLink.className = 'recent-comment-link'
        locationInfo.appendChild(locationLink)
      } else {
        locationInfo.textContent = locationText
      }

      const metaInfo = document.createElement('div')
      metaInfo.className = 'recent-comment-meta'

      const authorSpan = document.createElement('span')
      authorSpan.className = 'recent-comment-author'
      authorSpan.textContent = comment.username

      const dateSpan = document.createElement('span')
      dateSpan.className = 'recent-comment-date'
      dateSpan.textContent = formattedDate

      metaInfo.appendChild(authorSpan)
      metaInfo.appendChild(document.createTextNode(' • '))
      metaInfo.appendChild(dateSpan)

      commentHeader.appendChild(locationInfo)
      commentHeader.appendChild(metaInfo)

      const commentText = document.createElement('div')
      commentText.className = 'recent-comment-text'

      // Truncate long comments
      const maxLength = 200
      let displayText = comment.text
      if (comment.text.length > maxLength) {
        displayText = comment.text.substring(0, maxLength) + '...'
      }

      // Split text by newlines and create text nodes and br elements
      displayText.split('\n').forEach((line, index, array) => {
        commentText.appendChild(document.createTextNode(line))
        if (index < array.length - 1) {
          commentText.appendChild(document.createElement('br'))
        }
      })

      commentElement.appendChild(commentHeader)
      commentElement.appendChild(commentText)

      content.appendChild(commentElement)
    })
  } catch (error) {
    while (content.firstChild) {
      content.removeChild(content.firstChild)
    }
    const errorDiv = document.createElement('div')
    errorDiv.className = 'recent-comments-error'
    errorDiv.textContent = `Failed to load recent comments: ${error.message}`
    content.appendChild(errorDiv)
  }
}
