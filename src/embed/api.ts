import type { EmbedComment } from '../shared/embed'
import type { BackgroundApi, BackgroundRequest, CommentView, Result } from '../shared/messages'
import type {
  RelayComment,
  RelayCommentRequest,
  RelayEdit,
  RelayEditRequest,
  RelayReportRequest,
  RelayVote,
  RelayVoteRequest,
} from '../shared/relay'

import { EMBED_CACHE_SECONDS, EMBED_COMMENTS_PATH, EMBED_PARAMS } from '../shared/embed'
import { FIREBASE_CONFIG } from '../shared/firebase-config'
import { RELAY_URL } from '../shared/relay'
import { cleanUsername, EDIT_WINDOW_MS } from '../shared/validation'
import { readValue, writeValue } from './ext'

// Answers the extension UI's requests (callBackground) in the embed, where there's no background script: reads come
// from the relay's cached /comments, writes go to the relay like the extension's, and deleting goes to Firestore
// under the security rules, like the extension. Signing in is anonymous Firebase Auth over its REST API (no SDK),
// only once the viewer posts, votes, reports or deletes.

// The extension's anonymous user ID key, reused so the UI's code finds it under the same name
const USER_ID = 'CTextFilterStore_strCleanPattern_1039531631'
// The viewer's own comments (ID → createdAt) and upvotes: /comments is the same for everyone, so who wrote or upvoted
// a comment is remembered here instead. Only covers what was done in this embed on this site (storage is per site).
const OWN = 'embedOwn'
const VOTED = 'embedVoted'
const SESSION = 'embedSession'
// When the viewer last changed something: until the relay's cache has expired, /comments is asked past it
const LAST_WRITE = 'embedLastWrite'

type Handlers = {
  [K in keyof BackgroundApi]?: (request: BackgroundApi[K]['request']) => Promise<BackgroundApi[K]['response']>
}

class EmbedError extends Error {
  override name = 'EmbedError'
}

const handlers: Handlers = {
  async listComments() {
    const params = new URLSearchParams()
    const page = new URLSearchParams(location.search)
    for (const key of EMBED_PARAMS) params.set(key, page.get(key) ?? '')
    // The relay's answer is cached for everyone; after the viewer's own change, ask for a copy that includes it
    const lastWrite = Number(readValue(LAST_WRITE)) || 0
    if (Date.now() - lastWrite < EMBED_CACHE_SECONDS * 1000) params.set('after', String(lastWrite))
    const comments = await relay<EmbedComment[]>(`${EMBED_COMMENTS_PATH}?${params}`)
    const own = record(OWN)
    const voted = record(VOTED)
    return comments.map(comment => toView(comment, own, voted))
  },

  async createComment({ property, text, username, replyTo, turnstileToken }) {
    const body: RelayCommentRequest = {
      property,
      text,
      username,
      userId: userId(),
      turnstileToken,
      ...(replyTo && { replyTo }),
    }
    const { id, createdAt, parentId, replyToId } = await relay<RelayComment>('/comment', body, true)
    writeValue(OWN, { ...record(OWN), [id]: createdAt })
    wrote()
    return {
      id,
      text: text.trim(),
      username: cleanUsername(username),
      createdAt,
      votes: 0,
      hasVoted: false,
      isOwn: true,
      canDelete: true,
      editableUntil: createdAt + EDIT_WINDOW_MS,
      ...(parentId && replyToId && { parentId, replyToId }),
    }
  },

  async editComment({ commentId, text }) {
    const body: RelayEditRequest = { commentId, text, userId: userId() }
    const edit = await relay<RelayEdit>('/edit', body, true)
    wrote()
    return edit
  },

  async toggleVote({ commentId }) {
    const body: RelayVoteRequest = { commentId, userId: userId() }
    const vote = await relay<RelayVote>('/vote', body, true)
    const voted = record(VOTED)
    if (vote.hasVoted) voted[commentId] = 1
    else delete voted[commentId]
    writeValue(VOTED, voted)
    wrote()
    return vote
  },

  async deleteComment({ commentId }) {
    // Straight to Firestore, like the extension: the security rules allow it only for the comment's author. A local
    // relay on the emulator (`pnpm embed:preview`) names it in the page, so deletes go where its comments are.
    const { projectId } = FIREBASE_CONFIG
    const firestore =
      document.querySelector<HTMLMetaElement>('meta[name="rec-firestore"]')?.content ||
      'https://firestore.googleapis.com'
    const url = `${firestore}/v1/projects/${projectId}/databases/(default)/documents/listingcomments/${encodeURIComponent(commentId)}`
    const response = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${await idToken()}` } })
    if (response.status === 403) throw new EmbedError('You can only delete your own comments.')
    if (!response.ok) throw new EmbedError('Couldn’t delete the comment. Please try again.')
    const own = record(OWN)
    delete own[commentId]
    writeValue(OWN, own)
    wrote()
    return null
  },

  async reportComment({ commentId, reason, details }) {
    const body: RelayReportRequest = { commentId, reason, details, userId: userId() }
    await relay<null>('/report', body, true)
    return null
  },

  // The extension's toolbar badge: nothing to do here
  setBadge: () => Promise.resolve(null),
}

// The handler the ext shim calls with each request (see ext.ts)
export async function handleMessage(message: unknown): Promise<Result<unknown>> {
  const { type, ...request } = (message ?? {}) as BackgroundRequest
  const handle = handlers[type] as ((request: unknown) => Promise<unknown>) | undefined
  if (!handle) return { ok: false, error: 'That isn’t available here.' }
  try {
    return { ok: true, data: await handle(request) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof EmbedError ? error.message : 'Something went wrong. Please try again.',
    }
  }
}

function toView(comment: EmbedComment, own: Record<string, number>, voted: Record<string, number>): CommentView {
  const isOwn = comment.id in own
  const view: CommentView = {
    ...comment,
    hasVoted: comment.id in voted,
    isOwn,
    canDelete: isOwn,
  }
  if (isOwn && comment.createdAt) view.editableUntil = comment.createdAt + EDIT_WINDOW_MS
  return view
}

// A request to the relay, which answers with a Result whose error is safe to show
async function relay<T>(path: string, body?: unknown, signedIn = false): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${RELAY_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(signedIn && { authorization: `Bearer ${await idToken()}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error instanceof EmbedError) throw error
    throw new EmbedError('Couldn’t connect. Check your internet connection and try again.')
  }
  const result = (await response.json().catch(() => null)) as Result<T> | null
  if (!result) throw new EmbedError('Something went wrong. Please try again.')
  if (!result.ok) throw new EmbedError(result.error)
  return result.data
}

function record(key: string): Record<string, number> {
  const value = readValue(key)
  return value && typeof value === 'object' ? { ...(value as Record<string, number>) } : {}
}

function wrote() {
  writeValue(LAST_WRITE, Date.now())
}

function userId(): string {
  const existing = readValue(USER_ID)
  if (typeof existing === 'string' && existing) return existing
  const id = crypto.randomUUID()
  writeValue(USER_ID, id)
  return id
}

// Anonymous Firebase Auth over REST: sign up once, keep the refresh token, and exchange it for an ID token (valid an
// hour) when one is needed. The relay checks the ID token to learn the viewer's Auth UID.
interface Session {
  refreshToken: string
}

let current: { token: string; expires: number } | null = null
let pending: Promise<string> | null = null

function idToken(): Promise<string> {
  if (current && Date.now() < current.expires) return Promise.resolve(current.token)
  pending ??= fetchIdToken().finally(() => {
    pending = null
  })
  return pending
}

async function fetchIdToken(): Promise<string> {
  const key = FIREBASE_CONFIG.apiKey
  const saved = readValue(SESSION) as Session | undefined
  if (saved?.refreshToken) {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken }),
    }).catch(() => null)
    if (response?.ok) {
      const data = (await response.json()) as { id_token: string; refresh_token: string; expires_in: string }
      return keep(data.id_token, data.refresh_token, data.expires_in)
    }
    // A refresh token that's no longer accepted (the account was removed): start a new session. Anything else
    // (offline) is an error, so a passing problem doesn't lose the viewer's identity.
    if (!response || response.status !== 400) {
      throw new EmbedError('Couldn’t connect. Check your internet connection and try again.')
    }
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  }).catch(() => null)
  if (!response?.ok) throw new EmbedError('Couldn’t connect. Check your internet connection and try again.')
  const data = (await response.json()) as { idToken: string; refreshToken: string; expiresIn: string }
  return keep(data.idToken, data.refreshToken, data.expiresIn)
}

function keep(token: string, refreshToken: string, expiresIn: string): string {
  writeValue(SESSION, { refreshToken } satisfies Session)
  // A few minutes early, so a token never expires on its way to the relay
  current = { token, expires: Date.now() + (Number(expiresIn) - 300) * 1000 }
  return token
}
