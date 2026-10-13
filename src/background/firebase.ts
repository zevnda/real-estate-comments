import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension'
import { getFirestore } from 'firebase/firestore/lite'

// Public client config; access is controlled by the Firestore security rules, not by keeping this secret.
const firebaseConfig = {
  apiKey: 'AIzaSyAuEVyfsPVkpdPtPLK3eWDxulcAHTWZQoQ',
  authDomain: 'realestatecomments.firebaseapp.com',
  projectId: 'realestatecomments',
  storageBucket: 'realestatecomments.firebasestorage.app',
  messagingSenderId: '819214707372',
  appId: '1:819214707372:web:12ec0084ba8e70d914cd09',
}

const app = initializeApp(firebaseConfig)
// Firestore Lite talks plain REST over fetch: no WebChannel/XHR (unavailable in Chrome's service worker) and a much
// smaller bundle. The extension never needs realtime listeners.
export const db = getFirestore(app)
// The web-extension build of Auth avoids the DOM and popup code that breaks in a service worker.
const auth = getAuth(app)

let signingIn: Promise<string> | null = null

// The security rules require a signed-in user, so every request goes through this first. Concurrent callers share
// one sign-in. Returns the Firebase Auth UID, which the rules use to check who may delete a comment. The session is
// kept in the extension's IndexedDB, so the UID stays the same across browser restarts.
export function ensureSignedIn(): Promise<string> {
  signingIn ??= (async () => {
    await auth.authStateReady()
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user
    return user.uid
  })().finally(() => {
    signingIn = null
  })
  return signingIn
}

// A Firebase ID token for the signed-in user, which the comment relay checks to learn the poster's Auth UID. The SDK
// refreshes it when it's close to expiring.
export async function getIdToken(): Promise<string> {
  await ensureSignedIn()
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  return user.getIdToken()
}
