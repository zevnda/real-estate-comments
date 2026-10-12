// `pnpm shitrentals emulator`: runs the local Firebase emulators with a copy of the real comments plus the converted
// ShitRentals reviews, for trying them in the emulator build of the extension (`pnpm build:emulator`). Nothing is
// written to the real project: production is only read (one query, for the copy), and the emulators keep everything
// in memory, so stopping them throws it all away.
import type { DocumentData } from 'firebase-admin/firestore'
import type { ImportedComment } from './parse.ts'

import { existsSync } from 'node:fs'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

import { propertyLinks } from '../../src/shared/property.ts'
import { EMULATOR_PROJECT, FIRESTORE_PORT, startEmulators } from '../emulator.ts'

const COMMENTS = 'listingcomments'
const BATCH = 500

export async function runEmulator(imported: ImportedComment[]): Promise<void> {
  const real = await copyProduction()

  console.log('Starting the Firestore and Auth emulators…')
  const stop = await startEmulators(['firestore', 'auth'])
  process.on('SIGINT', () => {
    stop()
    process.exit(0)
  })

  try {
    // Set only now, after the production copy: the Admin SDK reads it when a Firestore instance is created
    process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`
    const db = getFirestore(initializeApp({ projectId: EMULATOR_PROJECT }, 'emulator'))
    db.settings({ ignoreUndefinedProperties: true })
    const documents = [...real, ...imported.map(toDocument)]
    for (let i = 0; i < documents.length; i += BATCH) {
      const batch = db.batch()
      for (const { id, data } of documents.slice(i, i + BATCH)) batch.set(db.collection(COMMENTS).doc(id), data)
      await batch.commit()
    }
  } catch (error) {
    stop()
    throw error
  }

  const samples = imported.filter(comment => comment.postcode).filter((_, i) => i % 400 === 0)
  console.log(`
Emulators running with ${real.length} real comments (copied from production) and ${imported.length} ShitRentals reviews.

1. Run \`pnpm build:emulator\` if you haven't, and load dist/chrome-emulator in chrome://extensions
   ("Real Estate Comments (emulator)"). Turn the normal extension off while testing, or you'll get two panels.
2. Browse realestate.com.au or domain.com.au. Reviews show on matching listings and property profile pages, and in
   Search and Recent. Posting, replying and voting work, against the real security rules.
   Some property pages with a review:
${samples.map(comment => `   ${propertyLinks({ ...comment, postcode: comment.postcode! }).realestate}`).join('\n')}

Press Ctrl+C to stop. Everything in the emulators is thrown away; run this again to start fresh.`)
  // Keep running until Ctrl+C
  await new Promise(() => {})
}

// A copy of every real comment, so the reviews can be seen alongside them. Read-only, and skipped without a key.
async function copyProduction(): Promise<{ id: string; data: DocumentData }[]> {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!keyPath || !existsSync(keyPath)) {
    console.log('No FIREBASE_SERVICE_ACCOUNT in .env, so the real comments aren’t copied; only the reviews are loaded.')
    return []
  }
  console.log('Copying the real comments from production (read-only)…')
  const app = initializeApp({ credential: cert(keyPath) }, 'production')
  try {
    const snapshot = await getFirestore(app).collection(COMMENTS).get()
    return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }))
  } finally {
    await deleteApp(app)
  }
}

// The document as an import writes it: createdAt as a timestamp, plus the legacy `timestamp` string every comment has
function toDocument(comment: ImportedComment): { id: string; data: DocumentData } {
  const { id, createdAt, ...fields } = comment
  return { id, data: { ...fields, createdAt: Timestamp.fromDate(new Date(createdAt)), timestamp: createdAt } }
}
