import { CHALLENGE_ACTION } from '../../src/shared/relay.ts'
import { SITE_MATCHES } from '../../src/shared/sites.ts'

// The page the extension shows in an iframe in its comment box: it runs Turnstile and posts the token to the property
// page, where the extension's content script picks it up (as a JSON string; see ChallengeMessage). Only the two
// property sites may frame it. Turnstile's "interaction-only" appearance keeps it invisible unless Cloudflare wants
// the user to tick a box, and it tells the extension when to show the frame.
export function challengePage(siteKey: string, theme: string): Response {
  const options = {
    sitekey: siteKey,
    action: CHALLENGE_ACTION,
    theme: ['light', 'dark'].includes(theme) ? theme : 'auto',
    appearance: 'interaction-only',
    size: 'flexible',
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer">
<title>Real Estate Comments</title>
<style>html, body { margin: 0; background: transparent; overflow: hidden; }</style>
</head>
<body>
<div id="widget"></div>
<script>
  const send = message => parent.postMessage(JSON.stringify({ source: 'rec-challenge', ...message }), '*')
  window.onTurnstileLoad = () => {
    turnstile.render('#widget', {
      ...${JSON.stringify(options)},
      callback: token => send({ type: 'token', token }),
      'expired-callback': () => send({ type: 'expired' }),
      'error-callback': code => {
        send({ type: 'error', code: String(code) })
        return true
      },
      'before-interactive-callback': () => send({ type: 'interactive', on: true }),
      'after-interactive-callback': () => send({ type: 'interactive', on: false }),
    })
  }
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad" async defer></script>
</body>
</html>`
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'content-security-policy': `frame-ancestors ${frameAncestors()}`,
      'referrer-policy': 'no-referrer',
    },
  })
}

// https://www.realestate.com.au/* → https://www.realestate.com.au
function frameAncestors(): string {
  return SITE_MATCHES.map(match => match.replace(/\/\*$/, '')).join(' ')
}
