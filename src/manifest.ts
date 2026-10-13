// Builds manifest.json for each browser. This is the only manifest source; the version comes from package.json.

export type Browser = 'chrome' | 'firefox'

const SITES = [
  'https://www.realestate.com.au/*',
  'https://realestate.com.au/*',
  'https://www.domain.com.au/*',
  'https://domain.com.au/*',
  'https://www.homely.com.au/*',
  'https://homely.com.au/*',
]

const ICONS = {
  '48': 'icons/icon-48.png',
  '96': 'icons/icon-96.png',
  '128': 'icons/icon-128.png',
}

export function createManifest(browser: Browser, version: string): Record<string, unknown> {
  const manifest = {
    manifest_version: 3,
    name: 'Real Estate Comments',
    version,
    description:
      'Read and share honest comments about properties on realestate.com.au, domain.com.au and homely.com.au',
    icons: ICONS,
    permissions: ['storage'],
    host_permissions: SITES,
    action: {
      default_icon: ICONS,
      default_title: 'Real Estate Comments',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Show or hide property comments',
      },
    },
    content_scripts: [
      {
        matches: SITES,
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
  }

  if (browser === 'chrome') {
    return { ...manifest, background: { service_worker: 'background.js' }, minimum_chrome_version: '123' }
  }
  return {
    ...manifest,
    // Firefox runs MV3 background scripts as an event page rather than a service worker
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      // Must never change: it's how Firefox Add-ons identifies the published extension
      gecko: { id: 'real-estate-comments@zevnda.com', strict_min_version: '128.0' },
    },
  }
}
