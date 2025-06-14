import { parseMarkdown } from '../utils/markdown.js'
import { createSVGElement, getBrowserAPI } from '../utils/utils.js'
import moment from 'moment/min/moment-with-locales'

const sendMessage = async message => {
  const browserAPI = getBrowserAPI()

  if (typeof browser !== 'undefined' && browser.runtime) {
    return await browserAPI.runtime.sendMessage(message)
  } else {
    return new Promise(resolve => {
      browserAPI.runtime.sendMessage(message, resolve)
    })
  }
}

function getCommentDomainName(url) {
  if (!url) return null

  let domainNameText = ''

  if (url.includes('realestate.com.au')) {
    domainNameText = 'realestate.com.au'
  } else if (url.includes('domain.com.au')) {
    domainNameText = 'domain.com.au'
  } else {
    return null
  }

  const domainName = document.createElement('span')
  domainName.className = 'recent-comment-domain'
  domainName.textContent = domainNameText

  return domainName
}

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
    384,
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

export function showRecentCommentsInPanel() {
  const commentsList = document.getElementById('comments-list')
  if (!commentsList) return

  // Clear existing content
  while (commentsList.firstChild) {
    commentsList.removeChild(commentsList.firstChild)
  }

  // Add header alert
  const header = document.createElement('div')
  header.className = 'recent-comments-panel-header alert-info'

  // Create info icon
  const infoIcon = createSVGElement(
    'M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z',
  )

  const headerText = document.createElement('div')
  headerText.className = 'recent-comments-panel-header-text'

  const headerTextOne = document.createElement('p')
  headerTextOne.textContent = 'You are currently viewing the 5 most recent comments from all properties.'

  const headerTextTwo = document.createElement('p')
  headerTextTwo.textContent =
    "To view or leave comments for a specific property, navigate to that property's listing page."

  headerText.appendChild(headerTextOne)
  headerText.appendChild(headerTextTwo)
  header.appendChild(infoIcon)
  header.appendChild(headerText)
  commentsList.appendChild(header)

  // Add loading state
  const loadingDiv = document.createElement('div')
  loadingDiv.className = 'recent-comments-loading'
  loadingDiv.textContent = 'Loading recent comments...'
  commentsList.appendChild(loadingDiv)

  loadRecentCommentsForPanel()
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
    const response = await sendMessage({
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

      const formattedDate = moment(comment.timestamp).fromNow()

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

      const voteSpan = document.createElement('span')
      voteSpan.className = 'recent-comment-votes'
      voteSpan.textContent = `${comment.votes || 0} votes`

      metaInfo.appendChild(authorSpan)
      metaInfo.appendChild(document.createTextNode(' • '))
      metaInfo.appendChild(dateSpan)
      metaInfo.appendChild(document.createTextNode(' • '))
      metaInfo.appendChild(voteSpan)

      const websiteChip = getCommentDomainName(comment.url)
      if (websiteChip) {
        metaInfo.appendChild(document.createTextNode(' • '))
        metaInfo.appendChild(websiteChip)
      }

      commentHeader.appendChild(locationInfo)
      commentHeader.appendChild(metaInfo)

      const commentText = document.createElement('div')
      commentText.className = 'recent-comment-text'

      // Parse markdown and append DOM elements
      const parsedElements = parseMarkdown(comment.text)
      commentText.appendChild(parsedElements)

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

async function loadRecentCommentsForPanel() {
  const commentsList = document.getElementById('comments-list')
  if (!commentsList) return

  try {
    const response = await sendMessage({
      action: 'getRecentComments',
    })

    // Remove loading indicator
    const loadingDiv = commentsList.querySelector('.recent-comments-loading')
    if (loadingDiv) {
      loadingDiv.remove()
    }

    if (response.error) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'recent-comments-error'
      errorDiv.textContent = `Error loading comments: ${response.error}`
      commentsList.appendChild(errorDiv)
      return
    }

    if (response.isEmpty || !response.comments || response.comments.length === 0) {
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'recent-comments-empty'
      emptyDiv.textContent = 'No recent comments found.'
      commentsList.appendChild(emptyDiv)
      return
    }

    // Add comments
    response.comments.forEach(comment => {
      const commentElement = document.createElement('div')
      commentElement.className = 'recent-comment-item'

      const formattedDate = moment(comment.timestamp).fromNow()

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

      const voteSpan = document.createElement('span')
      voteSpan.className = 'recent-comment-votes'
      voteSpan.textContent = `${comment.votes || 0} votes`

      metaInfo.appendChild(authorSpan)
      metaInfo.appendChild(document.createTextNode(' • '))
      metaInfo.appendChild(dateSpan)
      metaInfo.appendChild(document.createTextNode(' • '))
      metaInfo.appendChild(voteSpan)

      const websiteChip = getCommentDomainName(comment.url)
      if (websiteChip) {
        metaInfo.appendChild(document.createTextNode(' • '))
        metaInfo.appendChild(websiteChip)
      }

      commentHeader.appendChild(locationInfo)
      commentHeader.appendChild(metaInfo)

      const commentText = document.createElement('div')
      commentText.className = 'recent-comment-text'

      // Parse markdown and append DOM elements
      const parsedElements = parseMarkdown(comment.text)
      commentText.appendChild(parsedElements)

      commentElement.appendChild(commentHeader)
      commentElement.appendChild(commentText)

      commentsList.appendChild(commentElement)
    })
  } catch (error) {
    // Remove loading indicator
    const loadingDiv = commentsList.querySelector('.recent-comments-loading')
    if (loadingDiv) {
      loadingDiv.remove()
    }

    const errorDiv = document.createElement('div')
    errorDiv.className = 'recent-comments-error'
    errorDiv.textContent = `Failed to load recent comments: ${error.message}`
    commentsList.appendChild(errorDiv)
  }
}
