import browserAPI from './browser-polyfill.js'
import firebaseConfig from './firebase-config.js'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { addDoc, collection, getDocs, getFirestore, limit, orderBy, query, where } from 'firebase/firestore'

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

// Rate limiting config
const RATE_LIMIT = {
  MAX_COMMENTS_PER_HOUR: 5,
  MAX_COMMENTS_PER_URL: 3,
  MIN_COMMENT_LENGTH: 5,
  MAX_COMMENT_LENGTH: 1200,
}

// Track user rate limiting
const userActivityCache = new Map()

// Check rate limits
async function checkRateLimit(url, userId) {
  const userKey = userId || 'anonymous'
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Initialize or get user's record
  if (!userActivityCache.has(userKey)) {
    userActivityCache.set(userKey, {
      lastComments: [],
      urlCounts: new Map(),
    })
  }

  const userRecord = userActivityCache.get(userKey)

  // Clean up old entries
  userRecord.lastComments = userRecord.lastComments.filter(timestamp => timestamp > hourAgo)

  // Check hour limit
  if (userRecord.lastComments.length >= RATE_LIMIT.MAX_COMMENTS_PER_HOUR) {
    return {
      allowed: false,
      reason: `You can only post ${RATE_LIMIT.MAX_COMMENTS_PER_HOUR} comments per hour.`,
    }
  }

  // Check URL limit
  const urlCount = userRecord.urlCounts.get(url) || 0
  if (urlCount >= RATE_LIMIT.MAX_COMMENTS_PER_URL) {
    return {
      allowed: false,
      reason: `You can only post ${RATE_LIMIT.MAX_COMMENTS_PER_URL} comments on this page.`,
    }
  }

  return { allowed: true }
}

// Update rate limit records
function updateRateLimitRecords(url, userId) {
  const userKey = userId || 'anonymous'
  const now = new Date()

  if (!userActivityCache.has(userKey)) {
    userActivityCache.set(userKey, {
      lastComments: [],
      urlCounts: new Map(),
    })
  }

  const userRecord = userActivityCache.get(userKey)

  // Update comment timestamp list
  userRecord.lastComments.push(now)

  // Update URL counter
  const urlCount = userRecord.urlCounts.get(url) || 0
  userRecord.urlCounts.set(url, urlCount + 1)
}

// Validate comment content
function validateComment(text) {
  if (!text || text.trim().length < RATE_LIMIT.MIN_COMMENT_LENGTH) {
    return {
      valid: false,
      reason: `Comment must be at least ${RATE_LIMIT.MIN_COMMENT_LENGTH} characters.`,
    }
  }

  if (text.length > RATE_LIMIT.MAX_COMMENT_LENGTH) {
    return {
      valid: false,
      reason: `Comment cannot exceed ${RATE_LIMIT.MAX_COMMENT_LENGTH} characters.`,
    }
  }

  // Basic spam check - repeated characters
  // TODO: Implement more sophisticated spam detection
  const repeatedCharsRegex = /(.)\1{10,}/
  if (repeatedCharsRegex.test(text)) {
    return {
      valid: false,
      reason: 'Comment contains too many repeated characters.',
    }
  }

  return { valid: true }
}

// Parse address from meta title
function parseAddressFromTitle(title, url) {
  console.log(`Parsing title: ${title}`)

  if (!title) return null

  // Extract the address portion before " - " (hyphen with spaces on both sides)
  const match = title.match(/^(.+?)\s+-\s+/)
  if (!match) {
    console.log('No match found with regex')
    return null
  }

  const addressPart = match[1].trim()
  console.log(`Address part extracted: ${addressPart}`)

  // Split by commas and extract components
  const parts = addressPart.split(',').map(part => part.trim())
  console.log(`Address parts: ${JSON.stringify(parts)}`)

  if (parts.length < 3) {
    console.log(`Not enough parts: ${parts.length}`)
    return null
  }

  const address = parts[0].toLowerCase()
  const suburb = parts[1].toLowerCase()

  // Handle the state and postcode - they might be combined in one part
  const statePostcodePart = parts[2]
  const statePostcodeMatch = statePostcodePart.match(/^(\w+)\s+(\d{4})$/)

  if (!statePostcodeMatch) {
    console.log(`Could not parse state and postcode from: ${statePostcodePart}`)
    return null
  }

  const state = statePostcodeMatch[1].toLowerCase()
  const postcode = statePostcodeMatch[2]

  const result = {
    address,
    suburb,
    state,
    postcode,
    url,
  }

  console.log(`Parsed result: ${JSON.stringify(result)}`)
  return result
}

// Ensure user is authenticated
async function ensureAuthenticated() {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth)
      console.log('Signed in anonymously')
    } catch (error) {
      console.error('Error signing in anonymously:', error)
      throw error
    }
  }
  return auth.currentUser
}

try {
  // Use browserAPI instead of directly using chrome
  browserAPI.runtime.onInstalled.addListener(details => {
    // Clear cache when extension is installed/updated
    userActivityCache.clear()
  })

  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getComments') {
      const addressData = request.addressData

      if (!addressData || !addressData.address || !addressData.suburb) {
        return Promise.resolve({ comments: [], isEmpty: true, error: 'Invalid address data' })
      }

      return ensureAuthenticated()
        .then(() => {
          // Create a query to get comments for this address and suburb
          const commentsRef = collection(db, 'listingcomments')
          const q = query(
            commentsRef,
            where('address', '==', addressData.address),
            where('suburb', '==', addressData.suburb),
            orderBy('createdAt', 'desc'),
            limit(50),
          )

          return getDocs(q)
        })
        .then(querySnapshot => {
          if (querySnapshot.empty) {
            return { comments: [], isEmpty: true }
          } else {
            const comments = []
            querySnapshot.forEach(doc => {
              const data = doc.data()
              comments.push({
                id: doc.id,
                text: data.text,
                timestamp: data.timestamp,
                username: data.username,
              })
            })

            // Sort comments by timestamp newest first
            comments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

            return { comments: comments, isEmpty: false }
          }
        })
        .catch(error => {
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

      // Check rate limiting using a combination of address and suburb
      const locationKey = `${addressData.address}_${addressData.suburb}`
      return checkRateLimit(locationKey, sender.tab?.id).then(rateLimitResult => {
        if (!rateLimitResult.allowed) {
          return {
            status: 'error',
            message: rateLimitResult.reason,
          }
        }

        return ensureAuthenticated()
          .then(() => {
            // Use the provided username or default to Anonymous
            const username =
              comment.username && comment.username.trim() !== ''
                ? comment.username.trim().substring(0, 50)
                : 'Anonymous'

            // Create new comment document in Firestore
            const commentsRef = collection(db, 'listingcomments')
            const commentData = {
              address: addressData.address,
              suburb: addressData.suburb,
              state: addressData.state,
              postcode: addressData.postcode,
              url: request.url || addressData.url,
              text: comment.text.trim(),
              timestamp: comment.timestamp || new Date().toISOString(),
              username: username,
              createdAt: new Date(),
            }

            return addDoc(commentsRef, commentData)
          })
          .then(docRef => {
            // Update rate limit records
            updateRateLimitRecords(locationKey, sender.tab?.id)

            return {
              status: 'success',
              commentId: docRef.id,
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
