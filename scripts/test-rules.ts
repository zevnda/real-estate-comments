// Tests firestore.rules against the Firestore emulator: `pnpm test:rules` (needs Java). Starts the emulator, runs
// tests/rules with Vitest, then stops the emulator.
import { spawn } from 'node:child_process'

import { startEmulators } from './emulator.ts'

let exitCode = 1
let stopEmulators = () => {}
try {
  stopEmulators = await startEmulators(['firestore'])
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
  stopEmulators()
}
process.exitCode = exitCode
