// Public client config; access is controlled by the Firestore security rules, not by keeping this secret. Used by
// the extension's background script (with the Firebase SDK) and by the embed (src/embed/, over REST).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAuEVyfsPVkpdPtPLK3eWDxulcAHTWZQoQ',
  authDomain: 'realestatecomments.firebaseapp.com',
  projectId: 'realestatecomments',
  storageBucket: 'realestatecomments.firebasestorage.app',
  messagingSenderId: '819214707372',
  appId: '1:819214707372:web:12ec0084ba8e70d914cd09',
}
