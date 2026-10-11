import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // The security rules tests need the Firestore emulator; they run with `pnpm test:rules` (vitest.rules.config.ts)
  test: { exclude: [...configDefaults.exclude, 'tests/rules/**'] },
})
