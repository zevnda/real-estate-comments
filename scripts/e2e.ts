// End-to-end smoke test: loads dist/chrome into Chromium and serves fake listing pages at real realestate.com.au and
// domain.com.au URLs (the real sites block automated browsers). The extension itself runs for real, including
// Firebase sign-in and Firestore reads against production. It never posts, votes or deletes.
//
//   pnpm build && pnpm e2e            (first time: pnpm exec playwright install chromium)
//   pnpm e2e --screenshots <dir>      also saves screenshots of each step, in light and dark mode
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

// Lets Playwright see the background service worker's requests (used to check the cache)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'

const EXTENSION = resolve('dist/chrome')
const screenshotArg = process.argv.indexOf('--screenshots')
const screenshotDir = screenshotArg > -1 ? process.argv[screenshotArg + 1] : undefined

// Pages for properties that have comments in production (see tests/property.test.ts)
const PAGES: Record<string, string> = {
  'https://www.realestate.com.au/property-house-qld-hendra-444861312':
    '65 Newmarket Street, Hendra, Qld 4011 - House for Sale - realestate.com.au',
  'https://www.realestate.com.au/property-house-nsw-dundas+valley-442858264':
    '97  Yates Ave, Dundas Valley, NSW 2117 - House for Rent - realestate.com.au',
  'https://www.realestate.com.au/property-house-nsw-concord-434909539':
    '9 Warbrick Street, Concord, NSW 2137 - House for Sale - realestate.com.au',
  'https://www.domain.com.au/3-42-kent-street-epping-nsw-2121-17650798': '3/42 Kent Street, Epping NSW 2121 | Domain',
  'https://www.realestate.com.au/buy': 'Real Estate & Property for Sale - realestate.com.au',
}

function fakePage(title: string): string {
  const filler = 'Lorem ipsum dolor sit amet. '.repeat(40)
  return `<!doctype html><html><head><title>${title}</title></head><body style="margin:0;font-family:Arial">
    <div style="height:64px;background:#e4002b"></div>
    <main style="padding:24px;max-width:1100px"><h1>${title}</h1>
    <div style="height:340px;background:#ddd;border-radius:8px"></div><p>${filler}</p></main></body></html>`
}

async function run(colorScheme: 'light' | 'dark') {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    colorScheme,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  })
  // Wait for the background service worker to start
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker')

  const page = await context.newPage()
  // Firestore queries sent by the background script, to check the cache (needs the service worker network events)
  let firestoreQueries = 0
  // The reply check's failures (see useNotifications)
  const replyCheckErrors: string[] = []
  // Lookups of the user's own comments, which the reply check starts with
  let ownCommentQueries = 0
  context.on('request', request => {
    if (!request.url().includes('firestore.googleapis.com') || !request.url().includes(':runQuery')) return
    firestoreQueries++
    if (/"fieldPath":\s*"uid"/.test(request.postData() ?? '')) {
      ownCommentQueries++
      void request.response().then(response => {
        if (response && !response.ok()) replyCheckErrors.push(`Firestore answered ${response.status()}`)
      })
    }
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/^https:\/\/(www\.)?(realestate|domain)\.com\.au\//, route => {
    const url = route.request().url().split(/[?#]/)[0]!
    return route.fulfill({ status: 200, contentType: 'text/html', body: fakePage(PAGES[url] ?? 'Not found') })
  })

  const ui = (selector: string) => page.locator(`real-estate-comments >> css=${selector}`)
  const step = async (name: string, check: () => Promise<void>) => {
    await check()
    if (screenshotDir) {
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(screenshotDir, `${colorScheme}-${name}.png`) })
    }
    console.log(`  ✓ ${name}`)
  }
  // The panel checks for replies to the user's comments when it opens (see useNotifications); this catches it failing
  page.on('console', message => {
    if (message.text().includes('Checking for replies failed')) replyCheckErrors.push(message.text())
  })
  const waitForComments = () => ui('.comment').first().waitFor({ timeout: 20_000 })
  const panelTitle = () => ui('.panel-title').textContent()

  console.log(`${colorScheme} mode:`)
  await page.goto('https://www.realestate.com.au/property-house-qld-hendra-444861312')
  await step('launcher shows the comment count', async () => {
    await ui('.launcher-badge').waitFor({ timeout: 20_000 })
  })

  await ui('.launcher').click()
  await step('panel lists the property’s comments', async () => {
    await waitForComments()
    assert.equal(await panelTitle(), '65 Newmarket Street')
  })

  await step('prefills a GitHub issue from “Report a bug”', async () => {
    const href = (await ui('.panel-footer a:has-text("Report a bug")').getAttribute('href')) ?? ''
    const url = new URL(href)
    assert.equal(url.origin + url.pathname, 'https://github.com/zevnda/real-estate-comments/issues/new')
    const body = url.searchParams.get('body') ?? ''
    assert.match(body, /Extension version: \d+\.\d+\.\d+/)
    assert.match(body, /Browser: Chrome \d+/)
    assert.ok(body.includes('Page: https://www.realestate.com.au/property-house-qld-hendra-444861312\n'), body)
    assert.ok(body.includes('Property detected: 65 Newmarket Street, Hendra QLD 4011'), body)
  })

  // Opens the report dialog but never sends a report
  await step('reports a comment privately, in a dialog', async () => {
    await ui('.comment button:has-text("Report")').first().click()
    await ui('.dialog h3:text("Report this comment")').waitFor()
    const send = ui('.dialog button:has-text("Send report")')
    assert.ok(await send.isDisabled(), 'Send is disabled until a reason is chosen')
    assert.equal(await ui('.dialog .report-reason').count(), 6)
    await ui('.dialog .report-reason').first().click()
    assert.ok(await send.isEnabled(), 'Send is enabled once a reason is chosen')
    await page.keyboard.press('Escape')
    await ui('.dialog').waitFor({ state: 'detached' })
    assert.ok(await ui('.panel').isVisible(), 'Esc closed only the dialog')
  })

  await step('opens the terms and privacy policy, and links complaints to email', async () => {
    for (const [link, title] of [
      ['Terms', 'Terms of use'],
      ['Privacy', 'Privacy policy'],
    ]) {
      await ui(`.panel-footer button:has-text("${link}")`).click()
      await ui(`.dialog h3:text("${title}")`).waitFor()
      await page.keyboard.press('Escape')
      await ui('.dialog').waitFor({ state: 'detached' })
      assert.ok(await ui('.panel').isVisible(), 'Esc closed only the dialog')
    }
    const mailto = await ui('.panel-footer a:has-text("Complaints")').getAttribute('href')
    assert.ok(mailto?.startsWith('mailto:zevnda@gmail.com'), mailto ?? '')
  })

  await step('serves a revisited property from the cache, and absorbs refresh spam', async () => {
    assert.ok(firestoreQueries > 0, 'saw the first load reach Firestore')
    const before = firestoreQueries
    await page.reload()
    await waitForComments()
    assert.equal(firestoreQueries, before, 'revisiting the property queried Firestore again')

    // Within 30 s of the last fetch, refreshes are answered from the cache (a refresh after that fetches; see
    // tests/cache.test.ts). The button also rests for 2 s after each click.
    const refresh = ui('button[aria-label="Check for new comments"]')
    for (let i = 0; i < 3; i++) {
      await refresh.click()
      assert.ok(await refresh.isDisabled(), 'the button rests after a click')
      await page.waitForFunction(
        () =>
          !document
            .querySelector('real-estate-comments')
            ?.shadowRoot?.querySelector('button[aria-label="Check for new comments"]:disabled'),
        undefined,
        { timeout: 5_000 },
      )
    }
    assert.equal(firestoreQueries, before, 'refreshing straight after a fetch queried Firestore')
  })

  await step('shows the changelog from the footer, and once after an update', async () => {
    await ui('.panel-footer button:has-text("Changelog")').click()
    await ui('.dialog h3:text-matches("What’s new in version")').waitFor()
    assert.ok((await ui('.whats-new .markdown li').count()) > 0, 'the changelog is listed')
    await ui('.whats-new button:has-text("Got it")').click()
    await ui('.dialog').waitFor({ state: 'detached' })

    // What the background does after an update, then the next time the panel opens
    await context
      .serviceWorkers()[0]!
      .evaluate(() => chrome.storage.local.set({ whatsNewFor: chrome.runtime.getManifest().version }))
    await page.reload()
    await ui('.launcher')
      .click()
      .catch(() => {})
    await ui('.whats-new').waitFor({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await ui('.dialog').waitFor({ state: 'detached' })
    // Only once
    await page.reload()
    await ui('.panel')
      .waitFor({ timeout: 10_000 })
      .catch(() => ui('.launcher').click())
    await waitForComments()
    assert.equal(await ui('.whats-new').count(), 0)
  })

  await step('asks for a review once it’s been installed 30 minutes, until reviewed or declined', async () => {
    const setStorage = (values: Record<string, unknown>) =>
      context.serviceWorkers()[0]!.evaluate(items => chrome.storage.local.set(items), values)
    const openPanel = async () => {
      await page.reload()
      await ui('.panel').waitFor({ timeout: 10_000 })
    }
    await setStorage({ installedAt: Date.now() - 31 * 60_000, reviewAsked: 0 })
    await openPanel()
    await ui('.review').waitFor({ timeout: 10_000 })
    const href = (await ui('.review a:has-text("Leave a review")').getAttribute('href')) ?? ''
    assert.match(href, /^https:\/\/chromewebstore\.google\.com\/detail\/fpmhogbiebniapjfkbhgeacgkgpjaenn\/reviews$/)
    await ui('.review button:has-text("Maybe later")').click()
    await ui('.review').waitFor({ state: 'detached' })
    // Not again for a week
    await openPanel()
    await waitForComments()
    assert.equal(await ui('.review').count(), 0)
    // A week later it asks again; "No thanks" ends it
    await setStorage({ reviewAsked: Date.now() - 1000 })
    await openPanel()
    await ui('.review button:has-text("No thanks")').click()
    await ui('.review').waitFor({ state: 'detached' })
    await openPanel()
    await waitForComments()
    assert.equal(await ui('.review').count(), 0)
  })

  await step('explains formatting in a popup, closed with Esc without closing the panel', async () => {
    await ui('.link-button:text("Formatting help")').click()
    await ui('.overlay .dialog').waitFor()
    assert.ok((await ui('.formatting-table .markdown strong').count()) > 0)
  })
  await page.keyboard.press('Escape')
  await ui('.overlay').waitFor({ state: 'detached' })
  assert.ok(await ui('.panel').isVisible(), 'panel still open after closing the popup')

  await step('switches theme from the header button', async () => {
    const host = page.locator('real-estate-comments')
    const before = await host.getAttribute('data-theme')
    await ui('.header-actions button[aria-label*="theme"]').click()
    await page.waitForFunction(
      before => document.querySelector('real-estate-comments')?.getAttribute('data-theme') !== before,
      before,
    )
    const after = await host.getAttribute('data-theme')
    assert.ok(after === 'light' || after === 'dark')
    assert.notEqual(after, before)
  })
  // Back to the original theme, so screenshots match the run's colour scheme
  await ui('.header-actions button[aria-label*="theme"]').click()

  await page.goto('https://www.realestate.com.au/property-house-nsw-dundas+valley-442858264')
  await step('finds comments from a listing title with irregular spacing and abbreviations', async () => {
    await waitForComments()
    assert.equal(await panelTitle(), '97 Yates Ave')
  })

  await page.goto('https://www.domain.com.au/3-42-kent-street-epping-nsw-2121-17650798')
  await step('works on domain.com.au', async () => {
    await waitForComments()
    assert.equal(await panelTitle(), '3/42 Kent Street')
  })

  await page.goto('https://www.realestate.com.au/property-house-qld-hendra-444861312')
  await waitForComments()
  await step('ignores a stale title after client-side navigation', async () => {
    await page.evaluate(() => history.pushState({}, '', '/property-house-nsw-concord-434909539'))
    await page.waitForTimeout(700)
    assert.notEqual(await panelTitle(), '65 Newmarket Street')
    await page.evaluate(() => {
      document.title = '9 Warbrick Street, Concord, NSW 2137 - House for Sale - realestate.com.au'
    })
    await ui('.panel-title:text("9 Warbrick Street")').waitFor({ timeout: 5_000 })
    await waitForComments()
  })

  // The watchlist is kept in extension storage, never in Firestore, so this writes nothing to production
  await step('watches a property, lists it on the Watchlist tab, and stops watching', async () => {
    const star = ui('.header-actions button[aria-pressed]')
    await star.click()
    assert.equal(await star.getAttribute('aria-pressed'), 'true')
    const address = await panelTitle()
    await ui('.tabs button:has-text("Watchlist")').click()
    await ui('.watch-result').first().waitFor()
    assert.equal(await ui('.watch-result .search-result-address').first().textContent(), address)
    await ui('.watch-result .search-result').first().click()
    await waitForComments()
    await ui('.search-detail .back-button').click()
    await ui('.watch-result button[aria-label^="Stop watching"]').first().click()
    await ui('.watch-result').waitFor({ state: 'detached' })
    await ui('.tabs button:has-text("Property")').click()
    assert.equal(await star.getAttribute('aria-pressed'), 'false')
  })

  // Production has no replies to this fresh profile's comments, so notifications are put in storage, as a check would
  await step('lists notifications under the bell, and opens one', async () => {
    assert.deepEqual(replyCheckErrors, [], 'the reply check worked')
    // Once, however often the panel has been opened since: the rest came from the cache
    assert.equal(ownCommentQueries, 1, 'checked for replies once')
    const property = {
      address: '65 newmarket street',
      suburb: 'hendra',
      state: 'qld',
      postcode: '4011',
      displayAddress: '65 Newmarket Street',
      displayLocality: 'Hendra QLD 4011',
    }
    const notification = { kind: 'reply', username: 'Sam', text: 'Thanks, good to know.', property }
    const notifications = {
      since: 0,
      items: [
        { ...notification, id: 'e2e-unread', createdAt: Date.now() - 60_000, read: false },
        { ...notification, id: 'e2e-unread-2', kind: 'thread', createdAt: Date.now() - 120_000, read: false },
        { ...notification, id: 'e2e-read', kind: 'watch', createdAt: Date.now() - 3_600_000, read: true },
      ],
    }
    await context.serviceWorkers()[0]!.evaluate(items => chrome.storage.local.set(items), { notifications })
    await ui('.bell-count:text("2")').waitFor()
    const menu = ui('.notifications-menu')
    // A dropdown under the bell: Esc and clicks elsewhere in the panel close it, not the panel
    await ui('.bell-button').click()
    await menu.waitFor()
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    await ui('.bell-button').click()
    await ui('.panel-title').click()
    await menu.waitFor({ state: 'detached' })
    assert.ok(await ui('.panel').isVisible(), 'the panel stayed open')

    await ui('.bell-button').click()
    assert.deepEqual(await ui('.notification-group h4').allTextContents(), ['New', 'Earlier'])
    assert.match((await ui('.notification--unread').first().textContent()) ?? '', /Sam replied to your comment/)
    await ui('.notification--unread').first().click()
    await menu.waitFor({ state: 'detached' })
    assert.equal(await panelTitle(), '65 Newmarket Street')
    await waitForComments()
    // The made-up comment doesn't exist
    await ui('.hint-banner:has-text("since been deleted")').waitFor()
    await ui('.bell-count:text("1")').waitFor()

    // The footer marks the rest read
    await ui('.bell-button').click()
    await ui('.notifications-menu-footer').click()
    await ui('.bell-count').waitFor({ state: 'detached' })
    assert.equal(await ui('.notification--unread').count(), 0)
    assert.ok(await ui('.notifications-menu-footer').isDisabled())
    await page.keyboard.press('Escape')
    await ui('.search-detail .back-button').click()
    await ui('.panel-composer').waitFor()
    await context.serviceWorkers()[0]!.evaluate(() => chrome.storage.local.remove('notifications'))
  })

  await step('sorts and filters comments from the dropdown, showing a notice when none have images', async () => {
    const select = ui('.list-toolbar .view-select select')
    assert.deepEqual(await ui('.list-toolbar .view-select option').allTextContents(), ['Newest', 'Top', 'With images'])
    // None of this property's production comments link an image
    await select.selectOption('images')
    await ui('.notice-title:text("No comments with images")').waitFor()
    await ui('.notice button:has-text("Show all comments")').click()
    await waitForComments()
    assert.equal(await select.inputValue(), 'newest')
  })

  // Only the helper: nothing is uploaded or posted
  await step('adds an image link with the image helper, checking the link first', async () => {
    await ui('#rec-comment').fill('Image helper test. This is never posted.')
    await ui('.editor-image').click()
    await ui('.add-image input').fill('https://imgur.com/a/Ab12Cd3')
    assert.match((await ui('.add-image-status').textContent()) ?? '', /Imgur album/)
    assert.ok(await ui('.add-image button:has-text("Add")').isDisabled())
    await ui('.add-image input').fill('https://i.imgur.com/aB3dE5f.jpg')
    await ui('.add-image-status--ok').waitFor()
    await ui('.add-image button:has-text("Add")').click()
    await ui('.add-image').waitFor({ state: 'detached' })
    assert.equal(
      await ui('#rec-comment').inputValue(),
      'Image helper test. This is never posted.\n[Image](https://i.imgur.com/aB3dE5f.jpg)\n',
    )
    await ui('#rec-comment').fill('')
  })

  await step('previews a comment with its formatting, without posting', async () => {
    await ui('#rec-comment').fill('A **preview** test. This is never posted.')
    await ui('.composer .editor-tabs button:has-text("Preview")').click()
    assert.equal(await ui('.composer .editor-preview strong').textContent(), 'preview')
    assert.ok(await ui('#rec-comment').isHidden(), 'the text box is hidden while previewing')
    await ui('.composer .editor-tabs button:has-text("Write")').click()
    assert.ok(await ui('#rec-comment').isVisible())
  })

  await step('starts a reply from a comment, and Esc cancels it without closing the panel', async () => {
    await ui('.comment button:has-text("Reply")').first().click()
    await ui('.reply-bar').waitFor()
    assert.match((await ui('.reply-bar').textContent()) ?? '', /Replying to/)
    assert.equal(await ui('.composer button[type=submit]').textContent(), 'Reply')
    await ui('#rec-comment').press('Escape')
    await ui('.reply-bar').waitFor({ state: 'detached' })
    assert.ok(await ui('.panel').isVisible(), 'Esc cancelled only the reply')
  })

  // Closing the panel unmounts it; the draft is kept outside it
  await step('keeps a draft and its reply when the panel is closed and reopened', async () => {
    await ui('.comment button:has-text("Reply")').first().click()
    await ui('#rec-comment').fill('A draft that survives closing the panel.')
    await ui('button[aria-label="Close comments"]').click()
    await ui('.launcher').click()
    assert.equal(await ui('#rec-comment').inputValue(), 'A draft that survives closing the panel.')
    await ui('.reply-bar').waitFor()
    assert.equal(await ui('.comment--replying').count(), 1)
    await ui('.reply-bar button[aria-label="Cancel reply"]').click()
    await ui('#rec-comment').fill('')
  })

  // Like a listing's photo gallery: arrow keys anywhere on the page change photos and stop the default action
  await step('keeps keys typed in the panel from the site’s shortcuts', async () => {
    await page.evaluate(() => {
      const record = window as unknown as { siteKeys: number }
      record.siteKeys = 0
      for (const target of [window, document]) {
        target.addEventListener('keydown', event => {
          if (!(event instanceof KeyboardEvent) || !event.key.startsWith('Arrow')) return
          record.siteKeys++
          event.preventDefault()
        })
      }
    })
    await ui('#rec-comment').fill('ac')
    await ui('#rec-comment').press('ArrowLeft')
    await ui('#rec-comment').press('b')
    assert.equal(await ui('#rec-comment').inputValue(), 'abc', 'the caret moved')
    assert.equal(await page.evaluate(() => (window as unknown as { siteKeys: number }).siteKeys), 0)
    await ui('#rec-comment').fill('')
  })

  // A fresh profile has never agreed, and cancelling doesn't count as agreeing, so it asks again
  await step('asks to agree to the rules before a first post', async () => {
    await ui('#rec-comment').fill('Testing the composer. This is never posted.')
    for (let attempt = 0; attempt < 2; attempt++) {
      await ui('.composer button[type=submit]').click()
      await ui('.terms').waitFor()
      await ui('.terms .button--ghost').click()
      await ui('.terms').waitFor({ state: 'detached' })
    }
  })

  await page.goto('https://www.realestate.com.au/buy')
  await step('shows recent comments off property pages', async () => {
    if (!(await ui('.panel').isVisible())) await ui('.launcher').click()
    await waitForComments()
  })

  // Production has more than one page of comments; scrolling loads them until the end
  await step('loads more recent comments while scrolling, to the end', async () => {
    const recent = ui('.comment-list > .comment')
    assert.equal(await recent.count(), 10, 'the first page')
    for (let pages = 0; pages < 12 && !(await ui('.load-more p').count()); pages++) {
      const shown = await recent.count()
      await ui('.load-more').scrollIntoViewIfNeeded()
      await page.waitForFunction(
        count => {
          const root = document.querySelector('real-estate-comments')?.shadowRoot
          return (
            root?.querySelector('.load-more p') || root!.querySelectorAll('.comment-list > .comment').length > count
          )
        },
        shown,
        { timeout: 20_000 },
      )
    }
    const ids = await recent.evaluateAll(elements => elements.map(element => element.id))
    assert.ok(ids.length > 10, 'loaded more than the first page')
    assert.equal(new Set(ids).size, ids.length, 'no comment shown twice')
    assert.match((await ui('.load-more p').textContent()) ?? '', /That’s (every comment|the latest 100)/)
    await ui('.panel-scroll').evaluate(element => element.scrollTo(0, 0))
  })

  // A suburb's search results page: Concord NSW 2137 has a few production comments
  await page.goto('https://www.domain.com.au/rent/concord-nsw-2137/')
  await step('shows a suburb’s comment counts on its search page, and searches it', async () => {
    if (!(await ui('.panel').isVisible())) await ui('.launcher').click()
    assert.equal(await ui('.area-card-title').textContent(), 'Concord NSW 2137')
    // The button only appears once the counts have loaded, and there are some
    await ui('.area-card button:has-text("See them")').waitFor({ timeout: 20_000 })
    assert.match((await ui('.area-card-stats').textContent()) ?? '', /^\d+ comments? on \d+ propert/)
    await ui('.area-card button:has-text("See them")').click()
    await ui('.search-result').first().waitFor({ timeout: 20_000 })
    assert.equal(await ui('#rec-search').inputValue(), 'Concord 2137')
    assert.ok((await ui('.search-result-address').allTextContents()).includes('9 Warbrick Street'))
    await ui('.search-clear').click()
  })

  // Back to realestate.com.au: property links list the current site first, and the steps below expect it
  await page.goto('https://www.realestate.com.au/buy')
  await ui('.launcher').click()

  await step('finds comments by address search, despite different spelling', async () => {
    await ui('.tabs button:has-text("Search")').click()
    await ui('#rec-search').fill('97 Yates Avenue, Dundas Valley')
    // Results stay on screen while typing, so wait for this search's
    await ui('.search-result-address:text("97 Yates Avenue")').first().waitFor({ timeout: 20_000 })
    assert.equal(await ui('.search-result-address').first().textContent(), '97 Yates Avenue')
    // Results can be re-sorted or filtered
    const options = await ui('.search .view-select option').allTextContents()
    assert.deepEqual(options, ['Best match', 'Newest', 'Most comments', 'With images'])
  })

  await step('opens a search result’s comments', async () => {
    await ui('.search-result').first().click()
    await waitForComments()
    // Profile pages on both sites (current site first), then a web search
    const hrefs = await ui('.search-detail-heading .property-links a').evaluateAll(links =>
      links.map(link => link.getAttribute('href')),
    )
    assert.deepEqual(hrefs.slice(0, 2), [
      'https://www.realestate.com.au/property/97-yates-ave-dundas-valley-nsw-2117/',
      'https://www.domain.com.au/property-profile/97-yates-avenue-dundas-valley-nsw-2117',
    ])
  })

  await step('links recent comments to profile pages, not the listing they were posted on', async () => {
    await ui('.tabs button:has-text("Recent")').click()
    await waitForComments()
    // Shown with the comment's actions, next to Report
    const hrefs = await ui('.comment-actions .property-links a').evaluateAll(links =>
      links.map(link => link.getAttribute('href') ?? ''),
    )
    assert.ok(hrefs.length > 0)
    assert.ok(
      hrefs.every(href => /\/property\/|\/property-profile\/|google\.com\/search/.test(href)),
      hrefs.join('\n'),
    )
    await ui('.tabs button:has-text("Search")').click()
  })

  await step('shows no results for an address without comments', async () => {
    await ui('#rec-search').fill('97 Nowhere Street, Faketown')
    await ui('.notice-title:text("No comments found")').waitFor({ timeout: 20_000 })
  })

  // Searches without a street number. Concord NSW 2137 has three properties with comments in production, and North
  // Strathfield (also 2137) one.
  const resultAddresses = async (search: string) => {
    await ui('#rec-search').fill(search)
    await page.waitForFunction(
      () =>
        document.querySelector('real-estate-comments')?.shadowRoot?.querySelector('.search-result, .notice-title') !==
        null,
    )
    await page.waitForTimeout(1500)
    return ui('.search-result-address').allTextContents()
  }

  await step('searches by suburb, street, postcode, and misspelt suburb', async () => {
    const bySuburb = await resultAddresses('Concord')
    assert.ok(bySuburb.length >= 3, `suburb: ${bySuburb.join(', ')}`)
    assert.ok(bySuburb.includes('9 Warbrick Street'))

    assert.deepEqual(await resultAddresses('Warbrick St'), ['9 Warbrick Street'])

    const byPostcode = await resultAddresses('2137')
    assert.ok(
      byPostcode.includes('1/37 Sydney Street') && byPostcode.includes('9 Warbrick Street'),
      byPostcode.join(', '),
    )

    assert.ok((await resultAddresses('Concrd')).includes('9 Warbrick Street'))
  })

  await step('clears the search with the ✕ button', async () => {
    await ui('#rec-search').fill('Epping')
    await ui('.search-clear').click()
    assert.equal(await ui('#rec-search').inputValue(), '')
    await ui('.notice-title:text("Search comments")').waitFor()
    assert.equal(await ui('.search-clear').count(), 0, 'the button goes once the box is empty')
    // Focus goes back to the box, ready to type again
    assert.ok(await ui('#rec-search').evaluate(input => (input.getRootNode() as ShadowRoot).activeElement === input))
  })

  await step('closes when clicking outside the panel', async () => {
    await page.mouse.click(200, 400)
    await ui('.panel').waitFor({ state: 'detached' })
    await ui('.launcher').waitFor()
  })

  await page.setViewportSize({ width: 390, height: 760 })
  await page.goto('https://www.realestate.com.au/property-house-qld-hendra-444861312')
  await step('fits a phone screen', async () => {
    if (!(await ui('.panel').isVisible())) await ui('.launcher').click()
    await waitForComments()
  })

  assert.deepEqual(errors, [], 'page errors')
  await context.close()
}

if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
for (const scheme of screenshotDir ? (['light', 'dark'] as const) : (['light'] as const)) await run(scheme)
console.log('All end-to-end checks passed')
