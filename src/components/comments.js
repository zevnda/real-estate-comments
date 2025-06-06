import { parseMarkdown } from '../utils/markdown.js'
import { getBrowserAPI } from '../utils/utils.js'
import { hasAcceptedToS, showToSModal } from './commentsPanel.js'

// Simple browser API compatibility
const sendMessage = async message => {
  const browserAPI = getBrowserAPI()

  if (typeof browser !== 'undefined' && browser.runtime) {
    // Firefox
    return await browserAPI.runtime.sendMessage(message)
  } else {
    // Chrome
    return new Promise(resolve => {
      browserAPI.runtime.sendMessage(message, resolve)
    })
  }
}

// Get address data from page title
async function getAddressData() {
  const titleElement = document.querySelector('title')
  const titleFromElement = titleElement?.textContent
  const titleFromDocument = document.title

  const title = titleFromElement || titleFromDocument
  const response = await sendMessage({
    action: 'parseAddress',
    title: title,
    url: window.location.href,
  })

  console.log(`Parsed address data: ${JSON.stringify(response.addressData)}`)
  return response.addressData
}

export async function loadComments() {
  const addressData = await getAddressData()

  if (!addressData) {
    const commentsList = document.getElementById('comments-list')
    const errorPara = document.createElement('p')
    errorPara.className = 'no-comments'
    errorPara.textContent = 'Unable to identify property address from this page.'
    commentsList.appendChild(errorPara)
    return
  }

  sendMessage({
    action: 'getComments',
    addressData: addressData,
  }).then(response => {
    const commentsList = document.getElementById('comments-list')
    // Clear the existing comments
    while (commentsList.firstChild) {
      commentsList.removeChild(commentsList.firstChild)
    }

    if (response.error) {
      const errorPara = document.createElement('p')
      errorPara.className = 'no-comments'
      errorPara.textContent = `Error loading comments: ${response.error}`
      commentsList.appendChild(errorPara)
      return
    }

    if (response.isEmpty || !response.comments || response.comments.length === 0) {
      const noPara = document.createElement('p')
      noPara.className = 'no-comments'
      noPara.textContent = 'No comments yet. Be the first to share your thoughts about this property!'
      commentsList.appendChild(noPara)
      return
    }

    response.comments.forEach(comment => {
      const commentElement = document.createElement('div')
      commentElement.className = 'comment'
      commentElement.dataset.id = comment.id

      const date = new Date(comment.timestamp)
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString()

      const commentHeader = document.createElement('div')
      commentHeader.className = 'comment-header'

      const authorSpan = document.createElement('span')
      authorSpan.className = 'comment-author'
      authorSpan.textContent = comment.username

      const dateSpan = document.createElement('span')
      dateSpan.className = 'comment-date'
      dateSpan.textContent = formattedDate

      commentHeader.appendChild(authorSpan)
      commentHeader.appendChild(dateSpan)

      const commentText = document.createElement('div')
      commentText.className = 'comment-text'

      // Parse markdown and set as innerHTML
      const parsedHtml = parseMarkdown(comment.text)
      commentText.innerHTML = parsedHtml

      commentElement.appendChild(commentHeader)
      commentElement.appendChild(commentText)

      commentsList.appendChild(commentElement)
    })
  })
}

export async function submitComment() {
  // Check if user has accepted ToS
  const hasAccepted = await hasAcceptedToS()
  if (!hasAccepted) {
    showToSModal()
    return
  }

  const addressData = await getAddressData()

  if (!addressData) {
    alert('Unable to identify property address. Cannot save comment.')
    return
  }

  const commentText = document.getElementById('new-comment').value.trim()
  const username = document.getElementById('reacom-name').value.trim()

  if (!commentText) {
    alert('Please enter a comment before submitting.')
    return
  }

  if (commentText.length > 1200) {
    alert('Comment is too long. Maximum length is 1200 characters.')
    return
  }

  // Loading indicator
  const submitBtn = document.getElementById('submit-comment-btn')
  const originalText = submitBtn.innerText
  submitBtn.innerText = 'Authenticating...'
  submitBtn.disabled = true

  const comment = {
    text: commentText,
    timestamp: new Date().toISOString(),
    username: username || 'Anonymous',
  }

  sendMessage({
    action: 'saveComment',
    addressData: addressData,
    comment: comment,
    url: window.location.href,
  })
    .then(response => {
      submitBtn.innerText = originalText
      submitBtn.disabled = false

      if (response.status === 'success') {
        document.getElementById('new-comment').value = ''
        loadComments()
      } else {
        alert(`Failed to save comment: ${response.message || 'Unknown error'}`)
      }
    })
    .catch(error => {
      submitBtn.innerText = originalText
      submitBtn.disabled = false
      alert(`Failed to save comment: ${error.message || 'Network error'}`)
    })
}
