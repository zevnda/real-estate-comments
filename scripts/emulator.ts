// Starts and stops the local Firebase emulators (needs Java), for `pnpm test:rules` and `pnpm shitrentals emulator`.
// Not `firebase emulators:exec`, because on Windows that leaves the emulator's Java process running, holding the port
// for the next run. Ports are in firebase.json.
import { spawn } from 'node:child_process'
import { connect } from 'node:net'

// A demo- project ID: firebase-tools then never contacts a real project
export const EMULATOR_PROJECT = 'demo-real-estate-comments'
export const FIRESTORE_PORT = 8080
export const AUTH_PORT = 9099

export function portOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

// Resolves once every emulator is listening, with a function that stops them (and the Java process they started)
export async function startEmulators(only: ('firestore' | 'auth')[]): Promise<() => void> {
  const ports = only.map(name => (name === 'firestore' ? FIRESTORE_PORT : AUTH_PORT))
  for (const port of ports) {
    if (await portOpen(port))
      throw new Error(`Port ${port} is already in use (a leftover emulator?). Stop it and try again.`)
  }

  const emulator = spawn(
    process.execPath,
    [
      'node_modules/firebase-tools/lib/bin/firebase.js',
      'emulators:start',
      '--only',
      only.join(','),
      '--project',
      EMULATOR_PROJECT,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform !== 'win32' },
  )
  let output = ''
  emulator.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))

  const stop = () => {
    if (emulator.exitCode !== null || emulator.pid === undefined) return
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(emulator.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-emulator.pid, 'SIGTERM')
  }

  const started = Date.now()
  while (!(await Promise.all(ports.map(portOpen))).every(Boolean)) {
    if (emulator.exitCode !== null || Date.now() - started > 90_000) {
      stop()
      console.error(output)
      throw new Error('The emulators didn’t start (is Java installed?)')
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return stop
}
