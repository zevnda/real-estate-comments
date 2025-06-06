import { parseAddressFromTitle } from './address-parser.js'
import { validateComment } from './comment-validator.js'
import { getComments, getRecentComments, isUserBanned, saveComment, voteOnComment } from './firebase-service.js'
import { checkRateLimit, clearRateLimitCache, updateRateLimitRecords } from './rate-limiter.js'
import { getUserUID } from './user-service.js'
import { getBrowserAPI } from './utils/utils.js'

try {
  const browserAPI = getBrowserAPI()

  // Handle onInstalled event
  if (typeof browser !== 'undefined' && browser.runtime) {
    // Firefox - simulate onInstalled
    browserAPI.storage.local.get('extensionInstalled').then(result => {
      if (!result.extensionInstalled) {
        browserAPI.storage.local.set({ extensionInstalled: true }).then(() => {
          clearRateLimitCache()
        })
      }
    })
  } else {
    // Chrome
    browserAPI.runtime.onInstalled.addListener(details => {
      clearRateLimitCache()
    })
  }

  // Handle messages
  if (typeof browser !== 'undefined' && browser.runtime) {
    // Firefox
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const handleRequest = async () => {
        if (request.action === 'getComments') {
          const addressData = request.addressData

          if (!addressData || !addressData.address || !addressData.suburb) {
            return Promise.resolve({ comments: [], isEmpty: true, error: 'Invalid address data' })
          }

          return getComments(addressData).catch(error => {
            console.error('Error getting comments: ', error)
            return { error: error.message }
          })
        }

        if (request.action === 'getRecentComments') {
          return getRecentComments(5).catch(error => {
            console.error('Error getting recent comments: ', error)
            return { error: error.message }
          })
        }

        if (request.action === 'saveComment') {
          const addressData = request.addressData
          const comment = request.comment

          // Validate address data
          if (!addressData || !addressData.address || !addressData.suburb) {
            return Promise.resolve({
              status: 'error',
              message: 'Invalid address data. Unable to save comment.',
            })
          }

          // Validate the comment text
          const textValidation = validateComment(comment.text)
          if (!textValidation.valid) {
            return Promise.resolve({
              status: 'error',
              message: textValidation.reason,
            })
          }

          // Get user UID asynchronously
          return getUserUID()
            .then(userUID => {
              // Check if user is banned
              return isUserBanned(userUID).then(banned => {
                if (banned) {
                  return {
                    status: 'error',
                    message: 'Error 90001',
                  }
                }

                // Check rate limiting using a combination of address and suburb
                const locationKey = `${addressData.address}_${addressData.suburb}`
                return checkRateLimit(locationKey, sender.tab?.id).then(rateLimitResult => {
                  if (!rateLimitResult.allowed) {
                    return {
                      status: 'error',
                      message: rateLimitResult.reason,
                    }
                  }

                  return saveComment(addressData, comment, request.url, userUID)
                    .then(commentId => {
                      // Update rate limit records
                      updateRateLimitRecords(locationKey, sender.tab?.id)

                      return {
                        status: 'success',
                        commentId: commentId,
                      }
                    })
                    .catch(error => {
                      console.error('Error adding comment: ', error)
                      return {
                        status: 'error',
                        message: error.message,
                      }
                    })
                })
              })
            })
            .catch(error => {
              console.error('Error getting user UID or checking banned status: ', error)
              return {
                status: 'error',
                message: 'Error checking user status.',
              }
            })
        }

        if (request.action === 'voteComment') {
          const { commentId, voteType } = request

          if (!commentId || !voteType || !['up', 'down'].includes(voteType)) {
            return Promise.resolve({
              status: 'error',
              message: 'Invalid vote parameters',
            })
          }

          return getUserUID()
            .then(userUID => {
              return isUserBanned(userUID).then(banned => {
                if (banned) {
                  return {
                    status: 'error',
                    message: 'Error 90001',
                  }
                }

                return voteOnComment(commentId, voteType, userUID)
                  .then(result => ({
                    status: 'success',
                    votes: result.votes,
                    userVote: result.userVote,
                  }))
                  .catch(error => ({
                    status: 'error',
                    message: error.message,
                  }))
              })
            })
            .catch(error => ({
              status: 'error',
              message: 'Error checking user status',
            }))
        }

        if (request.action === 'parseAddress') {
          const title = request.title
          const url = request.url
          const addressData = parseAddressFromTitle(title, url)
          return Promise.resolve({ addressData })
        }

        return false
      }

      return handleRequest()
    })
  } else {
    // Chrome
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const handleRequest = async () => {
        if (request.action === 'getComments') {
          const addressData = request.addressData

          if (!addressData || !addressData.address || !addressData.suburb) {
            return Promise.resolve({ comments: [], isEmpty: true, error: 'Invalid address data' })
          }

          return getComments(addressData).catch(error => {
            console.error('Error getting comments: ', error)
            return { error: error.message }
          })
        }

        if (request.action === 'getRecentComments') {
          return getRecentComments(5).catch(error => {
            console.error('Error getting recent comments: ', error)
            return { error: error.message }
          })
        }

        if (request.action === 'saveComment') {
          const addressData = request.addressData
          const comment = request.comment

          // Validate address data
          if (!addressData || !addressData.address || !addressData.suburb) {
            return Promise.resolve({
              status: 'error',
              message: 'Invalid address data. Unable to save comment.',
            })
          }

          // Validate the comment text
          const textValidation = validateComment(comment.text)
          if (!textValidation.valid) {
            return Promise.resolve({
              status: 'error',
              message: textValidation.reason,
            })
          }

          // Get user UID asynchronously
          return getUserUID()
            .then(userUID => {
              // Check if user is banned
              return isUserBanned(userUID).then(banned => {
                if (banned) {
                  return {
                    status: 'error',
                    message: 'Error 90001',
                  }
                }

                // Check rate limiting using a combination of address and suburb
                const locationKey = `${addressData.address}_${addressData.suburb}`
                return checkRateLimit(locationKey, sender.tab?.id).then(rateLimitResult => {
                  if (!rateLimitResult.allowed) {
                    return {
                      status: 'error',
                      message: rateLimitResult.reason,
                    }
                  }

                  return saveComment(addressData, comment, request.url, userUID)
                    .then(commentId => {
                      // Update rate limit records
                      updateRateLimitRecords(locationKey, sender.tab?.id)

                      return {
                        status: 'success',
                        commentId: commentId,
                      }
                    })
                    .catch(error => {
                      console.error('Error adding comment: ', error)
                      return {
                        status: 'error',
                        message: error.message,
                      }
                    })
                })
              })
            })
            .catch(error => {
              console.error('Error getting user UID or checking banned status: ', error)
              return {
                status: 'error',
                message: 'Error checking user status.',
              }
            })
        }

        if (request.action === 'voteComment') {
          const { commentId, voteType } = request

          if (!commentId || !voteType || !['up', 'down'].includes(voteType)) {
            return Promise.resolve({
              status: 'error',
              message: 'Invalid vote parameters',
            })
          }

          return getUserUID()
            .then(userUID => {
              return isUserBanned(userUID).then(banned => {
                if (banned) {
                  return {
                    status: 'error',
                    message: 'Error 90001',
                  }
                }

                return voteOnComment(commentId, voteType, userUID)
                  .then(result => ({
                    status: 'success',
                    votes: result.votes,
                    userVote: result.userVote,
                  }))
                  .catch(error => ({
                    status: 'error',
                    message: error.message,
                  }))
              })
            })
            .catch(error => ({
              status: 'error',
              message: 'Error checking user status',
            }))
        }

        if (request.action === 'parseAddress') {
          const title = request.title
          const url = request.url
          const addressData = parseAddressFromTitle(title, url)
          return Promise.resolve({ addressData })
        }

        return false
      }

      handleRequest()
        .then(sendResponse)
        .catch(err => {
          console.error('Error in message handler:', err)
          sendResponse({ error: err.message })
        })

      return true // Keep message channel open for async response
    })
  }
} catch (e) {
  console.error('Error initializing background script:', e)
}
