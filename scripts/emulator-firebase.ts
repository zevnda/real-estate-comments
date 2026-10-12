// Bundled only by `pnpm build:emulator`, in place of src/background/emulator.ts: the extension then uses the local
// Firebase emulators (`pnpm shitrentals emulator`) under their demo project, so it can't reach the real one.
import type { Auth } from 'firebase/auth/web-extension'
import type { Firestore } from 'firebase/firestore/lite'

import { connectAuthEmulator } from 'firebase/auth/web-extension'
import { connectFirestoreEmulator } from 'firebase/firestore/lite'

export const EMULATOR_PROJECT_ID: string | null = 'demo-real-estate-comments'

export function connectEmulators(db: Firestore, auth: Auth): void {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}
