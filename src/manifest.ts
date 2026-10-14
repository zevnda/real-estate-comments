import { OPTIONAL_SITE_MATCHES, REQUIRED_SITE_MATCHES } from './shared/sites.ts'

// Builds manifest.json for each browser. This is the only manifest source; the version comes from package.json.

export type Browser = 'chrome' | 'firefox'

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
    // At most 132 characters (the Chrome Web Store's limit), so optional sites aren't named one by one
    description:
      'Read and share honest comments about properties on realestate.com.au, domain.com.au and other Australian property sites',
    icons: ICONS,
    // scripting: running on the optional sites the user turns on. activeTab: knowing which site the toolbar button was
    // clicked on, to offer an optional one. Neither shows a warning, so adding them didn't prompt existing users.
    permissions: ['storage', 'scripting', 'activeTab'],
    // Only the required sites. Never add one here: Chrome switches the extension off for existing users until they
    // accept a new site, so new sites go in optional_host_permissions (OPTIONAL_SITES in shared/sites.ts)
    host_permissions: REQUIRED_SITE_MATCHES,
    optional_host_permissions: OPTIONAL_SITE_MATCHES,
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
    // The Sites page: which sites the extension runs on, and turning optional ones on or off
    options_ui: { page: 'options.html', open_in_tab: true },
    // Required sites only: Chrome counts content script matches as host permissions. The background registers the
    // same script for optional sites once they're turned on.
    content_scripts: [
      {
        matches: REQUIRED_SITE_MATCHES,
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
      gecko: {
        // Must never change: it's how Firefox Add-ons identifies the published extension
        id: 'real-estate-comments@zevnda.com',
        strict_min_version: '128.0',
        // Firefox data collection declaration: disabled until Mozilla requires it for existing extensions, because
        // adding it prompts every Firefox user to approve it on update, and once a version declares it every later
        // version must. To enable: uncomment this, set strict_min_version to '140.0', uncomment gecko_android below,
        // and set firefox140 in scripts/build.ts (see CLAUDE.md, "Firefox data collection declaration").
        // Viewing a listing sends its address to look up comments (browsingActivity), and posting sends the comment
        // and name (personalCommunications).
        // data_collection_permissions: { required: ['browsingActivity', 'personalCommunications'] },
      },
      // Firefox for Android added data_collection_permissions in 142
      // gecko_android: { strict_min_version: '142.0' },
    },
  }
}
