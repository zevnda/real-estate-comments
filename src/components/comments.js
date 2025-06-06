import { parseMarkdown } from '../utils/markdown.js'
import { createSVGElement, getBrowserAPI } from '../utils/utils.js'
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

  const downvoteBtn = document.createElement('button')
  downvoteBtn.className = 'vote-btn downvote-btn'
  downvoteBtn.dataset.commentId = comment.id
  downvoteBtn.dataset.voteType = 'down'

  // Highlight button if user has voted
  if (comment.currentUserVote === 'down') {
    downvoteBtn.classList.add('active')
  }

  const downArrow = createSVGElement(
    'M256 464a208 208 0 1 1 0-416 208 208 0 1 1 0 416zM256 0a256 256 0 1 0 0 512A256 256 0 1 0 256 0zM376.9 294.6c4.5-4.2 7.1-10.1 7.1-16.3c0-12.3-10-22.3-22.3-22.3L304 256l0-96c0-17.7-14.3-32-32-32l-32 0c-17.7 0-32 14.3-32 32l0 96-57.7 0C138 256 128 266 128 278.3c0 6.2 2.6 12.1 7.1 16.3l107.1 99.9c3.8 3.5 8.7 5.5 13.8 5.5s10.1-2 13.8-5.5l107.1-99.9z',
  )
  downvoteBtn.appendChild(downArrow)

  // Add click event listeners
  upvoteBtn.addEventListener('click', handleVote)
  downvoteBtn.addEventListener('click', handleVote)

  voteContainer.appendChild(upvoteBtn)
  voteContainer.appendChild(voteScore)
  voteContainer.appendChild(downvoteBtn)

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

      // Update button states based on user's vote
      const upBtn = button.parentElement.querySelector('.upvote-btn')
      const downBtn = button.parentElement.querySelector('.downvote-btn')

      upBtn.classList.toggle('active', response.userVote === 'up')
      downBtn.classList.toggle('active', response.userVote === 'down')
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
