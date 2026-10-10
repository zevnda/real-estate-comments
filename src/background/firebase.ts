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

let signingIn: Promise<void> | null = null

// The security rules require a signed-in user, so every request goes through this first. Concurrent callers share
// one sign-in.
export function ensureSignedIn(): Promise<void> {
  signingIn ??= (async () => {
    await auth.authStateReady()
    if (!auth.currentUser) await signInAnonymously(auth)
  })().finally(() => {
    signingIn = null
  })
  return signingIn
}
