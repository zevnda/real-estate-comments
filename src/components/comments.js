import browserAPI from '../browser-polyfill.js'

// Get address data from page title
async function getAddressData() {
  const test = document.querySelector('title')?.textContent
  console.log(`Page title for address parsing: ${test}`)

  const title = document.querySelector('title')?.textContent || document.title
  const response = await browserAPI.runtime.sendMessage({
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

  browserAPI.runtime
    .sendMessage({
      action: 'getComments',
      addressData: addressData,
    })
    .then(response => {
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
        noPara.textContent = 'No comments yet. Be the first to share your insights about this property!'
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

        // Split text by newlines and create text nodes and br elements
        comment.text.split('\n').forEach((line, index, array) => {
          commentText.appendChild(document.createTextNode(line))
          if (index < array.length - 1) {
            commentText.appendChild(document.createElement('br'))
          }
        })

        commentElement.appendChild(commentHeader)
        commentElement.appendChild(commentText)

        commentsList.appendChild(commentElement)
      })
    })
}

export async function submitComment() {
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

  if (commentText.length > 500) {
    alert('Comment is too long. Maximum length is 500 characters.')
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

  browserAPI.runtime
    .sendMessage({
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
