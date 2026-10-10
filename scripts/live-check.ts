// Checks the built extension against the live sites. Starts your installed Chrome with a temporary profile, loads
// dist/chrome, opens real search pages, follows a few listings, and reports the page titles alongside what the
// extension made of them. Read-only: it opens the panel but never posts, votes or deletes.
//
//   pnpm build && pnpm live-check                 (default: rentals in Epping NSW 2121)
//   pnpm live-check -- <url> [<url> ...]          specific pages
//
// Why not Playwright: both sites block browsers that have a debugger attached while the page loads (realestate.com.au
// answers 429, domain.com.au "Access Denied"). This drives Chrome over --remote-debugging-pipe, opens tabs without
// attaching, and only attaches after the page has loaded, to read it. Keep the volume low: a handful of pages.
import type { ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { identifyProperty, isPropertyUrl } from '../src/shared/property.ts'

// Rent, sale and sold listings on both sites: each kind has its own URL or title format
const DEFAULT_SEARCHES = [
  'https://www.domain.com.au/rent/epping-nsw-2121/',
  'https://www.domain.com.au/sold-listings/epping-nsw-2121/',
  'https://www.realestate.com.au/rent/in-epping,+nsw+2121/list-1',
  'https://www.realestate.com.au/sold/in-epping,+nsw+2121/list-1',
]
const LISTINGS_PER_SEARCH = 2
const PAGE_WAIT_MS = 12_000

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
]

interface CdpResponse {
  id: number
  result?: Record<string, unknown>
  error?: { message: string }
}

class Chrome {
  private nextId = 0
  private pending = new Map<number, (response: CdpResponse) => void>()
  private buffer = ''
  private process: ChildProcess

  constructor(process: ChildProcess) {
    this.process = process
    const output = process.stdio[4] as Readable
    output.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      let end
      while ((end = this.buffer.indexOf('\0')) >= 0) {
        const message = JSON.parse(this.buffer.slice(0, end)) as CdpResponse
        this.buffer = this.buffer.slice(end + 1)
        this.pending.get(message.id)?.(message)
        this.pending.delete(message.id)
      }
    })
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = ++this.nextId
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, response =>
        response.error
          ? reject(new Error(`${method}: ${response.error.message}`))
          : resolvePromise(response.result as T),
      )
      ;(this.process.stdio[3] as Writable).write(JSON.stringify({ id, method, params, sessionId }) + '\0')
    })
  }

  async open(url: string): Promise<string> {
    const { targetId } = await this.send<{ targetId: string }>('Target.createTarget', { url })
    return targetId
  }

  // Attaches only for the duration of one evaluation
  async evaluate<T>(targetId: string, expression: string): Promise<T> {
    const { sessionId } = await this.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    try {
      const { result, exceptionDetails } = await this.send<{
        result: { value: T }
        exceptionDetails?: { text: string }
      }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
      if (exceptionDetails) throw new Error(exceptionDetails.text)
      return result.value
    } finally {
      await this.send('Target.detachFromTarget', { sessionId })
    }
  }

  close(target: string) {
    return this.send('Target.closeTarget', { targetId: target })
  }
}

interface PageReport {
  url: string
  title: string | null
  h1: string | null
  blocked: boolean
  notFound: boolean
  panel: { title: string | null; subtitle: string | null; body: string } | null
}

// Runs in the page: opens the extension's panel if needed, then reads the page and the panel
const READ_PAGE = `(async () => {
  const shadow = document.querySelector('real-estate-comments')?.shadowRoot
  shadow?.querySelector('.launcher')?.click()
  await new Promise(resolve => setTimeout(resolve, 4000))
  const text = selector => shadow?.querySelector(selector)?.textContent ?? null
  return {
    url: location.href,
    title: document.querySelector('title')?.textContent ?? null,
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    // realestate.com.au: "Looks like this page is off the market" (error code 404); domain.com.au: "Sorry, this page cannot be found."
    notFound: /off the market|cannot be found|page not found/i.test(document.querySelector('h1')?.textContent ?? ''),
    blocked: /access denied/i.test(document.title) || (document.title === '' && !document.querySelector('h1')),
    panel: shadow ? { title: text('.panel-title'), subtitle: text('.panel-subtitle'), body: (text('.panel-scroll') ?? '').slice(0, 100) } : null,
  }
})()`

const LISTING_LINKS = `[...new Set([...document.querySelectorAll('a[href]')].map(a => a.href.split('?')[0]))]`

async function main() {
  const chromePath = CHROME_PATHS.find(path => path && existsSync(path))
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH.')
  const extension = resolve('dist/chrome')
  if (!existsSync(join(extension, 'manifest.json'))) throw new Error('Run `pnpm build` first.')

  const profile = mkdtempSync(join(tmpdir(), 'rec-live-'))
  const process_ = spawn(
    chromePath,
    [
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      // Otherwise navigator.webdriver is true, and both sites block the page
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1400,950',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  )
  const chrome = new Chrome(process_)
  const sleep = (ms: number) => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

  let failures = 0
  try {
    await chrome.send('Extensions.loadUnpacked', { path: extension })

    const urls = process.argv.slice(2).filter(arg => arg !== '--')
    if (!urls.length) {
      for (const search of DEFAULT_SEARCHES) {
        const tab = await chrome.open(search)
        await sleep(PAGE_WAIT_MS)
        const links = await chrome.evaluate<string[]>(tab, LISTING_LINKS)
        const listings = links.filter(link => isPropertyUrl(link)).slice(0, LISTINGS_PER_SEARCH)
        if (!listings.length) console.log(`No listings found on ${search} (blocked?)`)
        urls.push(...listings)
        await chrome.close(tab)
      }
    }

    for (const url of urls) {
      const tab = await chrome.open(url)
      await sleep(PAGE_WAIT_MS)
      const report = await chrome.evaluate<PageReport>(tab, READ_PAGE)
      await chrome.close(tab)

      const expected = report.title ? identifyProperty(report.url, report.title) : null
      // A property page must be identified, and the panel must show that property
      const ok =
        !report.blocked &&
        !report.notFound &&
        (!isPropertyUrl(report.url) || (expected !== null && report.panel?.title === expected.displayAddress))
      if (!ok) failures++
      console.log(`\n${ok ? 'OK  ' : 'FAIL'} ${url}`)
      if (report.url !== url) console.log(`     redirected to ${report.url}`)
      console.log(`     title: ${report.title}`)
      console.log(`     h1:    ${report.h1}`)
      if (report.notFound) console.log('     page not found')
      else if (report.blocked) console.log('     blocked by bot protection')
      else if (!report.panel) console.log('     extension UI missing')
      else console.log(`     panel: ${report.panel.title} / ${report.panel.subtitle} / ${report.panel.body}`)
      if (isPropertyUrl(report.url) && !expected && !report.notFound) {
        console.log('     address not identifiable from this title')
      }
    }
  } finally {
    process_.kill()
    await sleep(1000)
    rmSync(profile, { recursive: true, force: true })
  }
  console.log(failures ? `\n${failures} page(s) failed` : '\nAll pages OK')
  process.exitCode = failures ? 1 : 0
}

await main()
