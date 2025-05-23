import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, query, where, orderBy, limit } from 'firebase/firestore';
import firebaseConfig from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Rate limiting config
const RATE_LIMIT = {
    MAX_COMMENTS_PER_HOUR: 5,
    MAX_COMMENTS_PER_URL: 3,
    MIN_COMMENT_LENGTH: 5,
    MAX_COMMENT_LENGTH: 500
};

// Track user rate limiting
const userActivityCache = new Map();

// Check rate limits
async function checkRateLimit(url, userId) {
    const userKey = userId || "anonymous";
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Initialize or get user's record
    if (!userActivityCache.has(userKey)) {
        userActivityCache.set(userKey, {
            lastComments: [],
            urlCounts: new Map()
        });
    }
    
    const userRecord = userActivityCache.get(userKey);
    
    // Clean up old entries
    userRecord.lastComments = userRecord.lastComments.filter(
        timestamp => timestamp > hourAgo
    );
    
    // Check hour limit
    if (userRecord.lastComments.length >= RATE_LIMIT.MAX_COMMENTS_PER_HOUR) {
        return {
            allowed: false,
            reason: `You can only post ${RATE_LIMIT.MAX_COMMENTS_PER_HOUR} comments per hour.`
        };
    }
    
    // Check URL limit
    const urlCount = userRecord.urlCounts.get(url) || 0;
    if (urlCount >= RATE_LIMIT.MAX_COMMENTS_PER_URL) {
        return {
            allowed: false,
            reason: `You can only post ${RATE_LIMIT.MAX_COMMENTS_PER_URL} comments on this page.`
        };
    }
    
    return { allowed: true };
}

// Update rate limit records
function updateRateLimitRecords(url, userId) {
    const userKey = userId || "anonymous";
    const now = new Date();
    
    if (!userActivityCache.has(userKey)) {
        userActivityCache.set(userKey, {
            lastComments: [],
            urlCounts: new Map()
        });
    }
    
    const userRecord = userActivityCache.get(userKey);
    
    // Update comment timestamp list
    userRecord.lastComments.push(now);
    
    // Update URL counter
    const urlCount = userRecord.urlCounts.get(url) || 0;
    userRecord.urlCounts.set(url, urlCount + 1);
}

// Validate comment content
function validateComment(text) {
    if (!text || text.trim().length < RATE_LIMIT.MIN_COMMENT_LENGTH) {
        return {
            valid: false,
            reason: `Comment must be at least ${RATE_LIMIT.MIN_COMMENT_LENGTH} characters.`
        };
    }
    
    if (text.length > RATE_LIMIT.MAX_COMMENT_LENGTH) {
        return {
            valid: false,
            reason: `Comment cannot exceed ${RATE_LIMIT.MAX_COMMENT_LENGTH} characters.`
        };
    }
    
    // Basic spam check - repeated characters
    // TODO - Implement more sophisticated spam detection
    const repeatedCharsRegex = /(.)\1{10,}/;
    if (repeatedCharsRegex.test(text)) {
        return {
            valid: false,
            reason: "Comment contains too many repeated characters."
        };
    }
    
    return { valid: true };
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("Real Estate Comments Extension Installed");
    
    // Clear cache when extension is installed/updated
    userActivityCache.clear();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getComments") {
        // Get comments for the specific URL from Firestore
        const url = request.url;
        
        // Create a query to get comments for this URL
        const commentsRef = collection(db, "comments");
        const q = query(
            commentsRef, 
            where("url", "==", url),
            orderBy("createdAt", "desc"),
            orderBy("__name__", "desc"),
            limit(50)
        );
        
        getDocs(q).then((querySnapshot) => {
            if (querySnapshot.empty) {
                sendResponse({ comments: [], isEmpty: true });
            } else {
                const comments = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    comments.push({
                        id: doc.id,
                        text: data.text,
                        timestamp: data.timestamp,
                        username: data.username
                    });
                });
                
                // Sort comments by timestamp (newest first)
                comments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                sendResponse({ comments: comments, isEmpty: false });
            }
        }).catch((error) => {
            console.error("Error getting comments: ", error);
            sendResponse({ error: error.message });
        });
        
        return true;
    }

    if (request.action === "saveComment") {
        const url = request.url;
        const comment = request.comment;
        
        // Validate the comment text
        const textValidation = validateComment(comment.text);
        if (!textValidation.valid) {
            sendResponse({ 
                status: "error", 
                message: textValidation.reason 
            });
            return true;
        }
        
        // Check rate limiting
        checkRateLimit(url, sender.tab?.id).then(rateLimitResult => {
            if (!rateLimitResult.allowed) {
                sendResponse({ 
                    status: "error", 
                    message: rateLimitResult.reason 
                });
                return;
            }
            
            // Use the provided username or default to Anonymous
            const username = comment.username && comment.username.trim() !== "" 
                ? comment.username.trim().substring(0, 50)
                : "Anonymous";
            
            // Create a new comment document in Firestore
            const commentsRef = collection(db, "comments");
            const commentData = {
                url: url,
                text: comment.text.trim(),
                timestamp: comment.timestamp || new Date().toISOString(),
                username: username,
                createdAt: new Date(),
                clientInfo: {
                    browser: navigator.userAgent,
                    tabId: sender.tab?.id
                }
            };
            
            addDoc(commentsRef, commentData)
                .then((docRef) => {
                    // Update rate limit records
                    updateRateLimitRecords(url, sender.tab?.id);
                    
                    sendResponse({ 
                        status: "success", 
                        commentId: docRef.id 
                    });
                })
                .catch((error) => {
                    console.error("Error adding comment: ", error);
                    sendResponse({ 
                        status: "error", 
                        message: error.message 
                    });
                });
        });
        
        return true;
    }
});