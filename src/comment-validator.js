// Validation config
const VALIDATION_RULES = {
  MIN_COMMENT_LENGTH: 5,
  MAX_COMMENT_LENGTH: 1200,
}

// Validate comment content
export function validateComment(text) {
  if (!text || text.trim().length < VALIDATION_RULES.MIN_COMMENT_LENGTH) {
    return {
      valid: false,
      reason: `Comment must be at least ${VALIDATION_RULES.MIN_COMMENT_LENGTH} characters.`,
    }
  }

  if (text.length > VALIDATION_RULES.MAX_COMMENT_LENGTH) {
    return {
      valid: false,
      reason: `Comment cannot exceed ${VALIDATION_RULES.MAX_COMMENT_LENGTH} characters.`,
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
