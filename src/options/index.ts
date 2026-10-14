import type { SiteInfo } from '../shared/sites'

import { ext } from '../shared/ext'
import { log } from '../shared/log'
import { OPTIONAL_SITES, REQUIRED_SITES } from '../shared/sites'
import { getStored } from '../shared/storage'

// The Sites page (the extension's options page): which sites the extension runs on, and turning the optional ones on
// or off. Opened from the panel's footer, or the browser's extension settings. The background registers the content
// script for whatever is turned on (background/sites.ts), however it's turned on.

async function render() {
  const required = document.getElementById('required')!
  const optional = document.getElementById('optional')!
  required.replaceChildren(...(await Promise.all(REQUIRED_SITES.map(site => siteRow(site, false)))))
  optional.replaceChildren(...(await Promise.all(OPTIONAL_SITES.map(site => siteRow(site, true)))))
}

async function siteRow(site: SiteInfo, canTurnOff: boolean): Promise<HTMLLIElement> {
  const on = await ext.permissions.contains({ origins: site.matches })
  const row = document.createElement('li')

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = site.name

  const actions = document.createElement('span')
  actions.className = 'actions'
  const state = document.createElement('span')
  state.className = on ? 'state on' : 'state'
  state.textContent = on ? 'On' : 'Off'
  actions.append(state)

  // Required sites can only be off if the user switched them off in the browser (Firefox lets them), so they only get
  // a Turn on button
  if (!on || canTurnOff) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = on ? 'Turn off' : 'Turn on'
    if (on) button.className = 'secondary'
    button.addEventListener('click', () => {
      // Requested straight away, inside the click: browsers only show the prompt in response to one
      const change = on
        ? ext.permissions.remove({ origins: site.matches })
        : ext.permissions.request({ origins: site.matches })
      change.then(
        () => void render(),
        (error: unknown) => log.warn(`Changing access to ${site.name} failed:`, error),
      )
    })
    actions.append(button)
  }

  row.append(name, actions)
  return row
}

// Follow the theme chosen in the panel
getStored('theme').then(
  theme => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  },
  () => {},
)

void render()
// Changed elsewhere too, e.g. from the toolbar button or the browser's settings
ext.permissions.onAdded.addListener(() => void render())
ext.permissions.onRemoved.addListener(() => void render())
