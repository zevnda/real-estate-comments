import type { PageState } from '../page-state'
import type { Store } from '../store'

import { useEffect, useRef, useState } from 'preact/hooks'

import { log } from '../../shared/log'
import { callBackground } from '../../shared/messages'
import { useComments, useStored } from '../hooks'
import { useStore } from '../store'
import { BrandIcon } from './icons'
import { Panel } from './Panel'

interface AppProps {
  // The shadow host: carries the theme attribute, and bounds "inside the panel" for click-outside
  host: HTMLElement
  page: Store<PageState>
  // Incremented each time the toolbar button or keyboard shortcut asks to open or close the panel
  toggles: Store<number>
}

export function App({ host, page: pageStore, toggles }: AppProps) {
  const page = useStore(pageStore)
  const toggleCount = useStore(toggles)
  const property = page.status === 'property' ? page.property : null
  const comments = useComments(property?.input ?? null)
  const [rememberOpen, saveRememberOpen, rememberLoaded] = useStored('panelOpen', false)
  const [open, setOpen] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const [theme, saveTheme] = useStored('theme', 'system')
  const systemDark = useSystemDark()
  const dark = theme === 'dark' || (theme === 'system' && systemDark)

  useEffect(() => {
    if (theme === 'system') delete host.dataset.theme
    else host.dataset.theme = theme
  }, [host, theme])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    saveRememberOpen(next)
    if (!next) setTimeout(() => launcher.current?.focus(), 0)
  }

  // Reopen the panel on property pages if it was left open, so it follows the user from listing to listing
  useEffect(() => {
    if (rememberLoaded && rememberOpen && property) setOpen(true)
    // Only when arriving on a new property, not whenever the remembered value changes
  }, [rememberLoaded, property?.input.url])

  useEffect(() => {
    if (toggleCount > 0) changeOpen(!open)
  }, [toggleCount])

  // Clicking anywhere on the page outside the panel closes it. Capture phase, so the site can't swallow the click.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!event.composedPath().includes(host)) changeOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, host])

  const count = comments.state.status === 'ready' ? comments.state.data.length : null
  useEffect(() => {
    callBackground('setBadge', { count }).catch(error => log.debug('Setting the toolbar badge failed:', error))
  }, [count])

  if (open) {
    return (
      <>
        <div
          class='page-backdrop'
          aria-hidden='true'
          // Never let a press here start a text selection on the page (Firefox would complete it on a later click),
          // and close on the full click rather than mid-press
          onMouseDown={event => event.preventDefault()}
          onClick={() => changeOpen(false)}
        />
        <Panel
          page={page}
          comments={comments}
          dark={dark}
          onToggleTheme={() => saveTheme(dark ? 'light' : 'dark')}
          onClose={() => changeOpen(false)}
        />
      </>
    )
  }

  const label = count ? `Open comments (${count})` : 'Open comments'
  return (
    <button
      ref={launcher}
      type='button'
      class={`launcher${count ? ' launcher--has-comments' : ''}`}
      // In Firefox, a press on the launcher (which then disappears) began a text selection drag that the next click completed
      onMouseDown={event => event.preventDefault()}
      onClick={() => changeOpen(true)}
      aria-label={label}
      title={label}
    >
      <BrandIcon size={26} />
      {!!count && <span class='launcher-badge'>{count > 99 ? '99+' : count}</span>}
    </button>
  )
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)')

function useSystemDark(): boolean {
  const [dark, setDark] = useState(darkQuery.matches)
  useEffect(() => {
    const onChange = () => setDark(darkQuery.matches)
    darkQuery.addEventListener('change', onChange)
    return () => darkQuery.removeEventListener('change', onChange)
  }, [])
  return dark
}
