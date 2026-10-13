import { defineConfig } from 'vitest/config'

// `pnpm test:rules` (scripts/test-rules.ts) starts the Firestore emulator, then runs these
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], testTimeout: 20_000, hookTimeout: 60_000, fileParallelism: false },
})
