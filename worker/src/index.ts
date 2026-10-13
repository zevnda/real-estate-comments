import type { Firestore } from './firestore.ts'
import type { RelayDeps } from './relay.ts'

import { challengePage } from './challenge.ts'
import { createFirestore, serviceAccountToken } from './firestore.ts'
import { ipKey, ipNetwork } from './ip.ts'
import { editComment, postComment, RelayError, reportComment, toggleVote } from './relay.ts'
import { verifyIdToken, verifyTurnstile } from './verify.ts'

// The comment relay (see CLAUDE.md, "Comment relay"). Deployed with `pnpm worker:deploy`; configuration in
// wrangler.jsonc, secrets set with `pnpm worker:secret <NAME>`.
export interface Env {
  FIREBASE_PROJECT: string
  TURNSTILE_SITE_KEY: string
  // The challenge page's hostname, which Turnstile reports back. Empty with Cloudflare's test keys.
  TURNSTILE_HOSTNAME: string
  // Secrets
  TURNSTILE_SECRET: string
  GOOGLE_SERVICE_ACCOUNT: string
  IP_KEY_SECRET: string
  // The Firestore emulator's address, for local development only
  FIRESTORE_EMULATOR?: string
}

// The extension calls the relay from its background script, whose origin differs by browser and, in Firefox, by
// install, so any origin is allowed. That's safe: every post needs a Turnstile token and a Firebase ID token.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

let firestore: { key: string; client: Firestore } | null = null

// The part of the Workers runtime's ExecutionContext used here
interface Context {
  waitUntil(task: Promise<unknown>): void
}

export default {
  async fetch(request: Request, env: Env, context: Context): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url)
    if (pathname === '/challenge' && request.method === 'GET') {
      return challengePage(env.TURNSTILE_SITE_KEY, searchParams.get('theme') ?? '')
    }
    const action = ACTIONS[pathname]
    if (!action) return new Response('Not found', { status: 404 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
    return json(await run(action, request, env, context))
  },
}

const ACTIONS: Record<string, (request: Request, deps: RelayDeps) => Promise<unknown>> = {
  '/comment': postComment,
  '/edit': editComment,
  '/report': reportComment,
  '/vote': toggleVote,
}

async function run(
  action: (request: Request, deps: RelayDeps) => Promise<unknown>,
  request: Request,
  env: Env,
  context: Context,
): Promise<{ status: number; body: unknown }> {
  // Set by Cloudflare from the connection itself; a client can't choose it
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  const network = ipNetwork(ip)
  if (!network) return { status: 400, body: { ok: false, error: 'Something went wrong. Please try again.' } }
  try {
    const data = await action(request, {
      firestore: getFirestore(env),
      verifyTurnstile: async token => {
        const result = await verifyTurnstile({
          secret: env.TURNSTILE_SECRET,
          token,
          ip,
          ...(env.TURNSTILE_HOSTNAME && { hostname: env.TURNSTILE_HOSTNAME }),
        })
        if (!result.ok) console.warn('Turnstile check failed:', result.errors.join(', '))
        return result.ok
      },
      verifyIdToken: token => verifyIdToken(token, env.FIREBASE_PROJECT),
      networkKey: await ipKey(network, env.IP_KEY_SECRET),
      secret: env.IP_KEY_SECRET,
      now: () => Date.now(),
      afterResponse: task =>
        context.waitUntil(task.catch((error: unknown) => console.warn('Deleting expired rate limits failed:', error))),
    })
    return { status: 200, body: { ok: true, data } }
  } catch (error) {
    if (error instanceof RelayError) return { status: error.status, body: { ok: false, error: error.message } }
    console.error(`${new URL(request.url).pathname} failed:`, error)
    return { status: 500, body: { ok: false, error: 'Something went wrong. Please try again.' } }
  }
}

function getFirestore(env: Env): Firestore {
  const key = env.FIRESTORE_EMULATOR ?? env.GOOGLE_SERVICE_ACCOUNT
  if (firestore?.key !== key) {
    const client = env.FIRESTORE_EMULATOR
      ? // The emulator accepts "owner" as an admin token
        createFirestore({
          project: env.FIREBASE_PROJECT,
          baseUrl: env.FIRESTORE_EMULATOR,
          token: () => Promise.resolve('owner'),
        })
      : createFirestore({ project: env.FIREBASE_PROJECT, token: serviceAccountToken(env.GOOGLE_SERVICE_ACCOUNT) })
    firestore = { key, client }
  }
  return firestore.client
}

function json({ status, body }: { status: number; body: unknown }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
