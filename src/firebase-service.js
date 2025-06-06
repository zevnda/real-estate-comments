import firebaseConfig from './firebase-config.js'
import { getUserUID } from './user-service.js'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

// Ensure user is authenticated
export async function ensureAuthenticated() {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth)
      console.log('Signed in anonymously')
    } catch (error) {
      console.error('Error signing in anonymously:', error)
      throw error
    }
  }
  return auth.currentUser
}

// Check if user is banned
export async function isUserBanned(uid) {
  await ensureAuthenticated()

  console.log(`Checking if user ${uid} is banned...`)

  const bannedUsersRef = collection(db, 'bannedUsers')
  const q = query(bannedUsersRef, where('uid', '==', uid))
  const querySnapshot = await getDocs(q)

  console.log(`Banned users query snapshot: ${querySnapshot.empty ? 'No banned users found' : 'Banned user exists'}`)

  return !querySnapshot.empty
}

// Vote on a comment
export async function voteOnComment(commentId, voteType, userUID) {
  await ensureAuthenticated()

  const commentRef = doc(db, 'listingcomments', commentId)
  const commentDoc = await getDoc(commentRef)

  if (!commentDoc.exists()) {
    throw new Error('Comment not found')
  }

  const commentData = commentDoc.data()
  let currentVotes = commentData.votes || 0
  let userVotes = commentData.userVotes || {}

  // Check if user has already voted
  const previousVote = userVotes[userUID]

  if (previousVote === voteType) {
    // User clicked same vote type - remove their vote
    delete userVotes[userUID]
    currentVotes -= voteType === 'up' ? 1 : -1
  } else if (previousVote) {
    // User had opposite vote - change it
    userVotes[userUID] = voteType
    currentVotes += voteType === 'up' ? 2 : -2
  } else {
    // New vote
    userVotes[userUID] = voteType
    currentVotes += voteType === 'up' ? 1 : -1
  }

  await updateDoc(commentRef, {
    votes: currentVotes,
    userVotes: userVotes,
  })

  return {
    votes: currentVotes,
    userVote: userVotes[userUID] || null,
  }
}

// Get comments for an address
export async function getComments(addressData) {
  await ensureAuthenticated()

  const commentsRef = collection(db, 'listingcomments')
  const q = query(
    commentsRef,
    where('address', '==', addressData.address),
    where('suburb', '==', addressData.suburb),
    orderBy('createdAt', 'desc'),
    limit(50),
  )

  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return { comments: [], isEmpty: true }
  }

  const currentUserUID = await getUserUID()

  const comments = []

  querySnapshot.forEach(doc => {
    const data = doc.data()
    const userVotes = data.userVotes || {}
    comments.push({
      id: doc.id,
      text: data.text,
      timestamp: data.timestamp,
      username: data.username,
      votes: data.votes || 0,
      userVotes: userVotes,
      currentUserVote: currentUserUID && userVotes[currentUserUID] ? userVotes[currentUserUID] : null,
    })
  })

  // Sort comments by timestamp newest first
  comments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  return { comments: comments, isEmpty: false }
}

// Save a new comment
export async function saveComment(addressData, comment, url, userUID) {
  await ensureAuthenticated()

  // Check if user is banned first
  const banned = await isUserBanned(userUID)
  if (banned) {
    throw new Error('User is banned from commenting')
  }

  // Use the provided username or default to Anonymous
  const username =
    comment.username && comment.username.trim() !== '' ? comment.username.trim().substring(0, 50) : 'Anonymous'

  // Create new comment document in Firestore
  const commentsRef = collection(db, 'listingcomments')
  const commentData = {
    address: addressData.address,
    suburb: addressData.suburb,
    state: addressData.state,
    postcode: addressData.postcode,
    url: url || addressData.url,
    text: comment.text.trim(),
    timestamp: comment.timestamp || new Date().toISOString(),
    username: username,
    uid: userUID,
    createdAt: new Date(),
  }

  const docRef = await addDoc(commentsRef, commentData)
  return docRef.id
}

// Get recent comments across all listings
export async function getRecentComments(limitCount = 3) {
  await ensureAuthenticated()

  const commentsRef = collection(db, 'listingcomments')
  const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(limitCount))

  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return { comments: [], isEmpty: true }
  }

  const currentUserUID = await getUserUID()
  const comments = []
  querySnapshot.forEach(doc => {
    const data = doc.data()
    const userVotes = data.userVotes || {}
    comments.push({
      id: doc.id,
      text: data.text,
      timestamp: data.timestamp,
      username: data.username,
      address: data.address,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      url: data.url,
      votes: data.votes || 0,
      userVotes: userVotes,
      currentUserVote: currentUserUID && userVotes[currentUserUID] ? userVotes[currentUserUID] : null,
    })
  })

  return { comments: comments, isEmpty: false }
}
