import type { ComponentChild } from 'preact'
import type { Theme } from '../../shared/storage'

import { useEffect, useRef, useState } from 'preact/hooks'

import { ExtensionError } from '../../shared/messages'
import { parseChallengeMessage, RELAY_URL } from '../../shared/relay'

// The bot check for posting: the comment relay's challenge page (Cloudflare Turnstile) in an iframe in the comment
// box. It only loads once the user starts writing, so just reading comments never contacts Cloudflare, and it's
// usually finished before they post. It stays invisible unless Cloudflare wants the user to tick a box.

const RELAY_ORIGIN = new URL(RELAY_URL).origin
// How long to wait for a token before giving up, unless Cloudflare is waiting for the user to tick its box
const TOKEN_WAIT_MS = 30_000

interface Waiter {
  resolve(token: string): void
  reject(error: Error): void
}

export interface Challenge {
  // Waits for a token. Each one is good for a single post, so taking it starts the next check.
  token(): Promise<string>
  frame: ComponentChild
  // Cloudflare wants the user to tick its box (the frame is showing)
  interactive: boolean
}

export function useChallenge(active: boolean, theme: Theme): Challenge {
  // Changing it reloads the frame, for a fresh check
  const [round, setRound] = useState(0)
  const [interactive, setInteractive] = useState(false)
  const interactiveRef = useRef(false)
  const ready = useRef<string | null>(null)
  const waiters = useRef<Waiter[]>([])

  const restart = () => {
    ready.current = null
    interactiveRef.current = false
    setInteractive(false)
    setRound(count => count + 1)
  }

  useEffect(() => {
    if (!active) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== RELAY_ORIGIN) return
      const message = parseChallengeMessage(event.data)
      if (!message) return
      if (message.type === 'token') {
        const waiter = waiters.current.shift()
        if (waiter) {
          waiter.resolve(message.token)
          restart()
        } else {
          ready.current = message.token
        }
      } else if (message.type === 'expired') {
        // Turnstile fetches a new one by itself
        ready.current = null
      } else if (message.type === 'interactive') {
        interactiveRef.current = message.on
        setInteractive(message.on)
      } else {
        const error = new ExtensionError(
          `Couldn’t check that you’re not a bot (error ${message.code}). Please try posting again.`,
        )
        for (const waiter of waiters.current.splice(0)) waiter.reject(error)
        restart()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [active])

  // Anyone still waiting when the comment box goes away
  useEffect(
    () => () => {
      for (const waiter of waiters.current.splice(0)) waiter.reject(new ExtensionError('Posting was cancelled.'))
    },
    [],
  )

  const token = (): Promise<string> => {
    const token = ready.current
    if (token) {
      restart()
      return Promise.resolve(token)
    }
    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const waiter: Waiter = {
        resolve: value => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: error => {
          clearTimeout(timer)
          reject(error)
        },
      }
      const check = () => {
        if (interactiveRef.current) {
          timer = setTimeout(check, TOKEN_WAIT_MS)
          return
        }
        waiters.current = waiters.current.filter(other => other !== waiter)
        restart()
        reject(
          new ExtensionError(
            'Couldn’t load the check that you’re not a bot. If you block scripts or ads, allow challenges.cloudflare.com, then try again.',
          ),
        )
      }
      timer = setTimeout(check, TOKEN_WAIT_MS)
      waiters.current.push(waiter)
    })
  }

  const frame = active ? (
    <iframe
      key={round}
      class={`challenge${interactive ? ' challenge--visible' : ''}`}
      src={`${RELAY_URL}/challenge?theme=${theme === 'system' ? 'auto' : theme}`}
      title='Check that you’re not a bot'
      referrerPolicy='no-referrer'
      tabIndex={interactive ? 0 : -1}
      aria-hidden={!interactive}
    />
  ) : null

  return { token, frame, interactive }
}
