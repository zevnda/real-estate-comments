// Tries the embed locally: `pnpm embed:preview` (needs Java, like `pnpm test:rules`). Builds, starts the Firestore
// emulator and the relay (`wrangler dev`, with worker/.dev.vars.example: Cloudflare's always-pass Turnstile keys and
// the emulator, so it never touches production data), switches the embed on, adds a few sample comments, serves a
// mock dropbee.au property page with the partner snippet (scripts/embed-preview.html) and opens it. Ctrl+C stops it
// all.
//
// Posting signs in with Firebase's real (anonymous) Auth, like the extension, but comments go to the emulator.
// Deleting your own comment doesn't work here: the embed deletes straight from the real Firestore, where the
// emulator's comments don't exist.
import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { resolve } from 'node:path'

import { EMBED_CONFIG_DOC } from '../src/shared/embed.ts'
import { createFirestore, encodeFields } from '../worker/src/firestore.ts'

const PROJECT = 'realestatecomments'
const EMULATOR_PORT = 8080
const RELAY_PORT = 8787
// Any localhost port may frame the embed (DEVELOPMENT_ORIGINS in worker/src/embed.ts)
const PAGE_PORT = 8788
const PAGE_PATH = '/p/11-260-casuarina-drive-nightcliff-nt-0810-00000000-0000-4000-8000-000000000000'

const children: ChildProcess[] = []

const portOpen = (port: number) =>
  new Promise<boolean>(resolve => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

async function waitFor(port: number, name: string, child: ChildProcess) {
  const started = Date.now()
  while (!(await portOpen(port))) {
    if (child.exitCode !== null) throw new Error(`${name} stopped while starting`)
    if (Date.now() - started > 120_000) throw new Error(`${name} didn’t start within 2 minutes`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

function run(args: string[], quiet = false): ChildProcess {
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', quiet ? 'ignore' : 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  })
  children.push(child)
  return child
}

// Stops each process and everything it started (the emulator's Java process on Windows, which would otherwise keep
// the port; see scripts/test-rules.ts)
function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  }
}

process.on('SIGINT', () => {
  console.log('\nStopping…')
  stopAll()
  process.exit(0)
})

for (const port of [EMULATOR_PORT, RELAY_PORT, PAGE_PORT]) {
  if (await portOpen(port)) {
    console.error(`Port ${port} is already in use (a leftover emulator or relay?). Stop that process and try again.`)
    process.exit(1)
  }
}

try {
  console.log('Building…')
  const build = run(['scripts/build.ts'], true)
  if ((await new Promise<number | null>(resolve => build.on('exit', resolve))) !== 0) throw new Error('Build failed')

  console.log('Starting the Firestore emulator and the relay…')
  const emulator = run(
    ['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--only', 'firestore', '--project', PROJECT],
    true,
  )
  const relay = run(
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--config',
      'worker/wrangler.jsonc',
      '--port',
      String(RELAY_PORT),
      // The example settings, not worker/.dev.vars, which could point at production. An absolute path: a relative
      // one is taken from the config's folder.
      '--env-file',
      resolve('worker/.dev.vars.example'),
    ],
    true,
  )
  await waitFor(EMULATOR_PORT, 'The Firestore emulator (is Java installed?)', emulator)

  // The embed is off until switched on (pnpm moderate in production); and a few comments to look at
  const firestore = createFirestore({
    project: PROJECT,
    baseUrl: `http://127.0.0.1:${EMULATOR_PORT}`,
    token: () => Promise.resolve('owner'),
  })
  const property = {
    address: '11/260 casuarina drive',
    suburb: 'nightcliff',
    state: 'nt',
    postcode: '0810',
    url: `https://www.dropbee.au${PAGE_PATH}`,
    uid: 'preview',
    authorAuthUid: 'preview',
    votes: 0,
  }
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const docs: Record<string, Record<string, unknown>> = {
    [EMBED_CONFIG_DOC]: { enabled: true, sites: { dropbee: true } },
    'listingcomments/preview1': {
      ...property,
      text: 'Lived here for two years. **Great breeze** off the water, but the lift was out a lot in the wet season.',
      username: 'Sam',
      createdAt: daysAgo(40),
      votes: 3,
    },
    'listingcomments/preview2': {
      ...property,
      text: 'Was the air con any good? Looking at renting it.',
      username: 'Priya',
      createdAt: daysAgo(10),
      parentId: 'preview1',
      replyToId: 'preview1',
    },
    'listingcomments/preview3': {
      ...property,
      text: 'Parking is tight, only one space and visitors park on the street.',
      username: 'Jo',
      createdAt: daysAgo(20),
    },
    'listingcomments/preview4': {
      ...property,
      text: 'Quiet complex and close to the Sunday markets.',
      username: 'Anonymous',
      createdAt: daysAgo(60),
      votes: 2,
    },
    'listingcomments/preview5': {
      ...property,
      text: 'Water pressure in the shower was weak when I lived here in 2024.',
      username: 'Mel',
      createdAt: daysAgo(90),
    },
  }
  await firestore.commit(
    Object.entries(docs).map(([path, fields]) => ({
      update: { name: firestore.name(path), fields: encodeFields(fields) },
    })),
  )

  // After the seed: the relay keeps the on/off switch for a minute once it has read it
  await waitFor(RELAY_PORT, 'The relay', relay)
  // Without its settings the relay answers with errors; check it's on the emulator before going on
  const check = await fetch(`http://127.0.0.1:${RELAY_PORT}/comments`).catch(() => null)
  if (!check || check.status >= 500)
    throw new Error('The relay started without its settings (worker/.dev.vars.example)')

  const page = readFileSync('scripts/embed-preview.html', 'utf8')
  createServer((request, response) => {
    if (request.url?.split('?')[0] !== PAGE_PATH) {
      response.writeHead(302, { location: PAGE_PATH }).end()
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
  }).listen(PAGE_PORT, '127.0.0.1')

  const url = `http://localhost:${PAGE_PORT}${PAGE_PATH}`
  console.log(
    `\nEmbed preview: ${url}\nThe embed's code is from the last build; restart this to see changes. Ctrl+C stops.`,
  )
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' })
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  stopAll()
  process.exit(1)
}
