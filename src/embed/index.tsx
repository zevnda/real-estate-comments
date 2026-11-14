import type { ComponentChild } from 'preact'
import type { EmbedMessage } from '../shared/embed'
import type { EmbedTheme } from '../shared/sites'

import { render } from 'preact'

import styles from '../content/ui/styles.css'
import { embedProperty, embedSiteFor } from '../shared/embed'
import { handleMessage } from './api'
import { App } from './App'
import embedStyles from './embed.css'
import { overrideValue, setMessageHandler } from './ext'
import dropbee from './themes/dropbee.css'

// The embed's page script (see CLAUDE.md, "Embed"): the comment section in the relay's /embed page, which partner
// sites show in an iframe, and the relay's /terms and /privacy pages that it links to. The relay only serves the
// embed's script when the embed is on for the site and the address matches the page, but it checks again here.

// Each partner's look: tokens and overrides on top of the extension's styles. Dark only, like the partners' sites.
const THEMES: Record<EmbedTheme, { css: string; fonts: string }> = {
  dropbee: {
    css: dropbee,
    // Must be declared on the document: @font-face inside a shadow root isn't used
    fonts:
      "@font-face { font-family: 'Sora'; src: url('/fonts/sora.woff2') format('woff2'); font-weight: 100 800; font-display: swap; }",
  },
}

// In a shadow root like the extension's, so its styles (written for :host) apply unchanged
function mount(theme: EmbedTheme, page: ComponentChild) {
  const { css, fonts } = THEMES[theme]
  const fontStyle = document.createElement('style')
  fontStyle.textContent = fonts
  document.head.append(fontStyle)

  overrideValue('theme', 'dark')
  const host = document.createElement('real-estate-comments')
  host.dataset.theme = 'dark'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles + embedStyles + css
  const container = document.createElement('div')
  shadow.append(style, container)
  document.body.append(host)
  render(page, container)
  return host
}

const property = embedProperty(new URLSearchParams(location.search))
const site = property && embedSiteFor(property.input.url)
if (property && site) {
  setMessageHandler(handleMessage)
  const host = mount(site.theme, <App property={property} />)

  // The partner page sizes the iframe to fit (the snippet in CLAUDE.md). Only the height is sent, so any origin may
  // receive it.
  let last = -1
  new ResizeObserver(() => {
    const height = Math.ceil(host.getBoundingClientRect().height)
    if (height === last) return
    last = height
    const message: EmbedMessage = { source: 'rec-embed', type: 'height', height }
    parent.postMessage(JSON.stringify(message), '*')
  }).observe(host)
}
