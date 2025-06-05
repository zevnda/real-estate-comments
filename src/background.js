import { parseAddressFromTitle } from './address-parser.js'
import browserAPI from './browser-polyfill.js'
import { validateComment } from './comment-validator.js'
import { getComments, isUserBanned, saveComment } from './firebase-service.js'
import { checkRateLimit, clearRateLimitCache, updateRateLimitRecords } from './rate-limiter.js'
import { getUserUID } from './user-service.js'

try {
  // Use browserAPI instead of directly using chrome
  browserAPI.runtime.onInstalled.addListener(details => {
    // Clear cache when extension is installed/updated
    clearRateLimitCache()
  })

  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

    if (request.action === 'parseAddress') {
      const title = request.title
      const url = request.url
      const addressData = parseAddressFromTitle(title, url)
      return Promise.resolve({ addressData })
    }

    return false
  })
} catch (e) {
  console.error('Error initializing background script:', e)
}
