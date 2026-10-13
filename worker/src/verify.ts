import { createRemoteJWKSet, jwtVerify } from 'jose'

import { CHALLENGE_ACTION } from '../../src/shared/relay.ts'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
// Google's public keys for Firebase ID tokens. The key set is fetched once per isolate and refreshed as needed.
const FIREBASE_KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

// Checks a Turnstile token with Cloudflare. Each token is single-use and expires after 5 minutes. `hostname` is where
// the challenge must have been solved (the relay's own challenge page); Cloudflare's test keys report example.com,
// so it's only checked when set.
export async function verifyTurnstile(options: {
  secret: string
  token: string
  ip: string
  hostname?: string
}): Promise<{ ok: boolean; errors: string[] }> {
  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: options.secret, response: options.token, remoteip: options.ip }),
  })
  if (!response.ok) return { ok: false, errors: [`siteverify answered ${response.status}`] }
  const result = (await response.json()) as {
    'success': boolean
    'hostname'?: string
    'action'?: string
    'error-codes'?: string[]
  }
  const errors = [...(result['error-codes'] ?? [])]
  if (result.success && options.hostname && result.hostname !== options.hostname) errors.push('wrong-hostname')
  // Test keys report no action either
  if (result.success && options.hostname && result.action !== CHALLENGE_ACTION) errors.push('wrong-action')
  return { ok: result.success && !errors.length, errors }
}

// Verifies a Firebase ID token (the extension's anonymous sign-in) and returns the user's Firebase Auth UID, which
// goes in the comment's authorAuthUid: the rules only let that user edit or delete it.
export async function verifyIdToken(token: string, project: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
      algorithms: ['RS256'],
    })
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}
