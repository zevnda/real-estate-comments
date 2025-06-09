import { getUserUID } from '../user-service.js'
import { parseMarkdown } from '../utils/markdown.js'
import { createSVGElement, getBrowserAPI } from '../utils/utils.js'
import { hasAcceptedToS, showToSModal } from './commentsPanel.js'
import moment from 'moment/min/moment-with-locales'

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
async function getAddressData(attempts = 0) {
  const maxAttempts = 3
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

  if (response.addressData) {
    return response.addressData
  }

  if (attempts < maxAttempts - 1) {
    console.log(`Address parsing failed, retrying in 1 second... (attempt ${attempts + 1}/${maxAttempts})`)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return getAddressData(attempts + 1)
  }

  console.log('Failed to parse address after 3 attempts')
  return null
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

  const panelTitle = document.getElementById('property-comments-panel-title')
  const capitalizeWords = str => str.replace(/\b\w/g, char => char.toUpperCase())
  panelTitle.textContent = `${capitalizeWords(addressData.address)}, ${capitalizeWords(addressData.suburb)}`

  // Get current user UID for ownership checking
  const currentUserUID = await getUserUID()

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

    const bubbleText = document.getElementById('property-comments-bubble-text')
    bubbleText.textContent = response.comments.length > 99 ? '99+' : response.comments.length
    bubbleText.style.opacity = '1'

    response.comments.forEach(comment => {
      const commentElement = document.createElement('div')
      commentElement.className = 'comment'
      commentElement.dataset.id = comment.id

      const formattedDate = moment(comment.timestamp).fromNow()

      const commentHeader = document.createElement('div')
      commentHeader.className = 'comment-header'

      const commentMeta = document.createElement('div')
      commentMeta.className = 'comment-meta'

      const authorSpan = document.createElement('span')
      authorSpan.className = 'comment-author'
      authorSpan.textContent = comment.username

      const dateSpan = document.createElement('span')
      dateSpan.className = 'comment-date'
      dateSpan.textContent = formattedDate

      commentMeta.appendChild(authorSpan)
      commentMeta.appendChild(dateSpan)

      const commentActions = document.createElement('div')
      commentActions.className = 'comment-actions'

      // Add delete button if user owns the comment
      if (currentUserUID && comment.uid === currentUserUID) {
        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'comment-delete-btn'
        deleteBtn.title = 'Delete comment'
        deleteBtn.dataset.commentId = comment.id

        const deleteSvg = createSVGElement(
          'M170.5 51.6L151.5 80l145 0-19-28.4c-1.5-2.2-4-3.6-6.7-3.6l-93.7 0c-2.7 0-5.2 1.3-6.7 3.6zm147-26.6L354.2 80 368 80l48 0 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-8 0 0 304c0 44.2-35.8 80-80 80l-224 0c-44.2 0-80-35.8-80-80l0-304-8 0c-13.3 0-24-10.7-24-24S10.7 80 24 80l8 0 48 0 13.8 0 36.7-55.1C140.9 9.4 158.4 0 177.1 0l93.7 0c18.7 0 36.2 9.4 46.6 24.9zM80 128l0 304c0 17.7 14.3 32 32 32l224 0c17.7 0 32-14.3 32-32l0-304L80 128zm80 64l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208c0-8.8 7.2-16 16-16s16 7.2 16 16zm80 0l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208c0-8.8 7.2-16 16-16s16 7.2 16 16zm80 0l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208c0-8.8 7.2-16 16-16s16 7.2 16 16z',
          448,
        )
        deleteBtn.appendChild(deleteSvg)
        deleteBtn.addEventListener('click', handleDeleteComment)

        commentActions.appendChild(deleteBtn)
      }

      commentHeader.appendChild(commentMeta)
      commentHeader.appendChild(commentActions)

      const commentText = document.createElement('div')
      commentText.className = 'comment-text'

      // Parse markdown and append DOM elements
      const parsedElements = parseMarkdown(comment.text)
      commentText.appendChild(parsedElements)

      // Create vote controls
      const voteControls = createVoteControls(comment)

      commentElement.appendChild(commentHeader)
      commentElement.appendChild(commentText)
      commentElement.appendChild(voteControls)

      commentsList.appendChild(commentElement)
    })
  })
}

function createVoteControls(comment) {
  const voteContainer = document.createElement('div')
  voteContainer.className = 'vote-controls'

  const voteBtnWrapper = document.createElement('div')
  voteBtnWrapper.className = 'vote-btn-wrapper'

  const upvoteBtn = document.createElement('button')
  upvoteBtn.className = 'vote-btn upvote-btn'
  upvoteBtn.dataset.commentId = comment.id
  upvoteBtn.dataset.voteType = 'up'

  // Highlight button if user has voted
  if (comment.currentUserVote === 'up') {
    upvoteBtn.classList.add('active')
  }

  const upArrow = createSVGElement(
    'M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM151.2 217.4c-4.6 4.2-7.2 10.1-7.2 16.4c0 12.3 10 22.3 22.3 22.3l41.7 0 0 96c0 17.7 14.3 32 32 32l32 0c17.7 0 32-14.3 32-32l0-96 41.7 0c12.3 0 22.3-10 22.3-22.3c0-6.2-2.6-12.1-7.2-16.4l-91-84c-3.8-3.5-8.7-5.4-13.9-5.4s-10.1 1.9-13.9 5.4l-91 84z',
  )
  upvoteBtn.appendChild(upArrow)

  const voteScore = document.createElement('span')
  voteScore.className = 'vote-score'
  voteScore.textContent = comment.votes || 0

  // Add click event listener
  upvoteBtn.addEventListener('click', handleVote)

  voteBtnWrapper.appendChild(upvoteBtn)
  voteBtnWrapper.appendChild(voteScore)

  voteContainer.appendChild(voteBtnWrapper)

  return voteContainer
}

async function handleVote(event) {
  const button = event.currentTarget
  const commentId = button.dataset.commentId
  const voteType = button.dataset.voteType

  try {
    const response = await sendMessage({
      action: 'voteComment',
      commentId: commentId,
      voteType: voteType,
    })

    if (response.status === 'success') {
      // Update the vote score display
      const voteScore = button.parentElement.querySelector('.vote-score')
      voteScore.textContent = response.votes

      // Update button state based on user's vote
      const upBtn = button.parentElement.querySelector('.upvote-btn')
      upBtn.classList.toggle('active', response.userVote === 'up')
    } else {
      console.error('Vote failed:', response.message)
    }
  } catch (error) {
    console.error('Error voting:', error)
  }
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

async function handleDeleteComment(event) {
  const button = event.currentTarget
  const commentId = button.dataset.commentId

  if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
    return
  }

  try {
    button.disabled = true
    button.style.opacity = '0.5'

    const response = await sendMessage({
      action: 'deleteComment',
      commentId: commentId,
    })

    if (response.status === 'success') {
      // Remove the comment element from the DOM
      const commentElement = button.closest('.comment')
      if (commentElement) {
        commentElement.remove()
      }

      // Reload comments to update count
      loadComments()
    } else {
      alert(`Failed to delete comment: ${response.message}`)
      button.disabled = false
      button.style.opacity = '1'
    }
  } catch (error) {
    alert(`Failed to delete comment: ${error.message}`)
    button.disabled = false
    button.style.opacity = '1'
  }
}
