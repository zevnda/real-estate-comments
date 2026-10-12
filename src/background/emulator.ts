import type { Auth } from 'firebase/auth/web-extension'
import type { Firestore } from 'firebase/firestore/lite'

// Does nothing. `pnpm build:emulator` swaps this file for scripts/emulator-firebase.ts, which connects to the local
// Firebase emulators instead of the real project; no other build contains that code.
export const EMULATOR_PROJECT_ID: string | null = null

export function connectEmulators(_db: Firestore, _auth: Auth): void {}
