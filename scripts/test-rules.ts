// Tests firestore.rules against the Firestore emulator: `pnpm test:rules` (needs Java). Starts the emulator, runs
// tests/rules with Vitest, then stops the emulator. Not `firebase emulators:exec`, because on Windows that leaves the
// emulator's Java process running, holding the port for the next run.
import { spawn } from 'node:child_process'
import { connect } from 'node:net'

const PORT = 8080
const PROJECT = 'demo-real-estate-comments'

const portOpen = () =>
  new Promise<boolean>(resolve => {
    const socket = connect(PORT, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

if (await portOpen()) {
  console.error(`Port ${PORT} is already in use (a leftover emulator?). Stop that process and try again.`)
  process.exit(1)
}

const emulator = spawn(
  process.execPath,
  ['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--only', 'firestore', '--project', PROJECT],
  { stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform !== 'win32' },
)
let output = ''
emulator.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))

// Stops the emulator and the Java process it started
function stopEmulator() {
  if (emulator.exitCode !== null || emulator.pid === undefined) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(emulator.pid), '/T', '/F'], { stdio: 'ignore' })
  else process.kill(-emulator.pid, 'SIGTERM')
}

let exitCode = 1
try {
  const started = Date.now()
  while (!(await portOpen())) {
    if (emulator.exitCode !== null || Date.now() - started > 90_000) {
      console.error(output)
      throw new Error('The Firestore emulator didn’t start (is Java installed?)')
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const tests = spawn(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.rules.config.ts'],
    {
      stdio: 'inherit',
    },
  )
  exitCode = await new Promise<number>(resolve => tests.on('exit', code => resolve(code ?? 1)))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
} finally {
  stopEmulator()
}
process.exitCode = exitCode
