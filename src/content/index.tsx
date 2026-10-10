import type { ContentMessage } from '../shared/messages'
import type { PageState } from './page-state'

import { render } from 'preact'

import { ext } from '../shared/ext'
import { log } from '../shared/log'
import { watchPage } from './page-state'
import { createStore } from './store'
import { App } from './ui/App'
import styles from './ui/styles.css'

const HOST_TAG = 'real-estate-comments'

function start() {
  // A copy left behind by a previous version of the extension (after an update or reload) stops itself when it
  // notices, but remove its UI straight away
  document.querySelectorAll(HOST_TAG).forEach(element => element.remove())

  // The UI lives in a shadow root: the site's CSS can't break it, and its CSS can't leak into the site
  const host = document.createElement(HOST_TAG)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  const mount = document.createElement('div')
  shadow.append(style, mount)
  document.documentElement.append(host)

  const page = createStore<PageState>({ status: 'browse' })
  const toggles = createStore(0)

  const onMessage = (message: ContentMessage) => {
    if (message?.type === 'togglePanel') toggles.set(toggles.get() + 1)
  }
  ext.runtime.onMessage.addListener(onMessage)

  const stop = watchPage(
    state => {
      log.debug('Page state:', state.status === 'property' ? state.property : state.status)
      page.set(state)
    },
    () => {
      // The extension was updated or reloaded: this script is orphaned and can no longer reach the background
      if (!ext.runtime?.id) {
        stop()
        render(null, mount)
        host.remove()
        return
      }
      // Some single-page apps replace large parts of the document; put the UI back if it was removed
      if (!host.isConnected) document.documentElement.append(host)
    },
  )

  render(<App host={host} page={page} toggles={toggles} />, mount)
}

try {
  start()
} catch (error) {
  log.error('Failed to start:', error)
}
