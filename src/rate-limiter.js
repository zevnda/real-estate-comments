// Rate limiting config
const RATE_LIMIT = {
  MAX_COMMENTS_PER_HOUR: 5,
  MAX_COMMENTS_PER_URL: 3,
}

// Track user rate limiting
const userActivityCache = new Map()

// Check rate limits
export async function checkRateLimit(url, userId) {
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
export function updateRateLimitRecords(url, userId) {
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

// Clear cache (for extension updates/installs)
export function clearRateLimitCache() {
  userActivityCache.clear()
}
