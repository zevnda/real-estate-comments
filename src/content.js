import browserAPI from './browser-polyfill.js';

// Function to check if current URL is a property page
function isPropertyPage() {
    return window.location.href.includes('realestate.com.au/property-');
}

// Create and inject the comments panel
function createCommentsPanel() {
    // Check if panel already exists, if so, don't create another one
    if (document.getElementById('property-comments-panel')) {
        return;
    }
    
    // Only create the panel if we're on a property page
    if (!isPropertyPage()) {
        return;
    }
    
    const panel = document.createElement('div');
    panel.id = 'property-comments-panel';
    
    // Check saved states before assigning class
    const savedState = localStorage.getItem('comments-panel-state');
    panel.className = savedState === 'minimized' 
        ? 'property-comments-container minimized' 
        : 'property-comments-container expanded';
    
    // Create header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'property-comments-header';
    
    const headerTitleDiv = document.createElement('div');
    headerTitleDiv.className = 'header-title';
    
    const headerCaret = document.createElement('span');
    headerCaret.className = 'header-caret';
    headerCaret.textContent = '▼';
    
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = 'Property Comments';
    
    headerTitleDiv.appendChild(headerCaret);
    headerTitleDiv.appendChild(headerTitle);
    
    const headerControlsDiv = document.createElement('div');
    headerControlsDiv.className = 'header-controls';
    
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'fullscreen-comments-btn';
    fullscreenBtn.title = 'Toggle fullscreen';
    
    const fullscreenIcon = document.createElement('i');
    fullscreenIcon.textContent = '⛶';
    fullscreenBtn.appendChild(fullscreenIcon);
    
    headerControlsDiv.appendChild(fullscreenBtn);
    
    headerDiv.appendChild(headerTitleDiv);
    headerDiv.appendChild(headerControlsDiv);
    
    // Create body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'property-comments-body';
    
    const commentsListDiv = document.createElement('div');
    commentsListDiv.id = 'comments-list';
    
    const commentsFormDiv = document.createElement('div');
    commentsFormDiv.className = 'property-comments-form';
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'reacom-name';
    nameInput.placeholder = 'Your name (optional)';
    
    const commentTextarea = document.createElement('textarea');
    commentTextarea.id = 'new-comment';
    commentTextarea.placeholder = 'Share your thoughts about this property...';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';
    
    const donateLink = document.createElement('a');
    donateLink.id = 'donate-btn';
    donateLink.href = 'https://github.com/sponsors/zevnda';
    donateLink.target = '_blank';
    donateLink.textContent = 'Donate';
    
    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit-comment-btn';
    submitBtn.textContent = 'Submit';
    
    buttonContainer.appendChild(donateLink);
    buttonContainer.appendChild(submitBtn);
    
    commentsFormDiv.appendChild(nameInput);
    commentsFormDiv.appendChild(commentTextarea);
    commentsFormDiv.appendChild(buttonContainer);
    
    bodyDiv.appendChild(commentsListDiv);
    bodyDiv.appendChild(commentsFormDiv);
    
    // Append all elements to panel
    panel.appendChild(headerDiv);
    panel.appendChild(bodyDiv);
    
    document.body.appendChild(panel);
    
    setTimeout(() => {
        const headerElement = document.querySelector('.property-comments-header');
        if (headerElement) {
            headerElement.addEventListener('click', function(event) {
                // Don't toggle if clicking on the fullscreen button
                if (!event.target.closest('#fullscreen-comments-btn')) {
                    toggleCommentsPanel();
                }
            });
            
            const caret = document.querySelector('.header-caret');
            if (caret && savedState === 'minimized') {
                caret.innerHTML = '▲';
            }
        }
        
        const fullscreenBtn = document.getElementById('fullscreen-comments-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
        }
        
        const submitBtn = document.getElementById('submit-comment-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', submitComment);
        }
    }, 100);
    
    // Load comments for this page
    loadComments();
}

function toggleCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    const caret = document.querySelector('.header-caret');
    
    if (panel.classList.contains('expanded')) {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        if (caret) caret.innerHTML = '▲';
        
        // Remove fullscreen if active
        panel.classList.remove('fullscreen');
        
        // Store the current state
        localStorage.setItem('comments-panel-state', 'minimized');
    } else {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        if (caret) caret.innerHTML = '▼';
        
        // Store the current state
        localStorage.setItem('comments-panel-state', 'expanded');
    }
}

function toggleFullscreen() {
    const panel = document.getElementById('property-comments-panel');
    const button = document.getElementById('fullscreen-comments-btn');
    
    if (panel.classList.contains('fullscreen')) {
        panel.classList.remove('fullscreen');
        button.innerHTML = '⛶';
        button.title = "Enter fullscreen";
    } else {
        panel.classList.add('fullscreen');
        button.innerHTML = '⮌';
        button.title = "Exit fullscreen";
        
        // Ensure we're not in minimized state
        if (panel.classList.contains('minimized')) {
            panel.classList.remove('minimized');
            panel.classList.add('expanded');
            
            const minimizeBtn = document.getElementById('minimize-comments-btn');
            if (minimizeBtn) {
                minimizeBtn.innerHTML = '−';
                minimizeBtn.title = "Minimize panel";
            }
        }
    }
}

function restorePanelState() {
    const panel = document.getElementById('property-comments-panel');
    
    // Restore state after events that might change it unexpectedly
    const savedState = localStorage.getItem('comments-panel-state');
    const caret = document.querySelector('.header-caret');
    
    if (savedState === 'minimized' && !panel.classList.contains('minimized')) {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        if (caret) caret.innerHTML = '▲';
    } else if (savedState === 'expanded' && !panel.classList.contains('expanded')) {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        if (caret) caret.innerHTML = '▼';
    }
}

function loadComments() {
    browserAPI.runtime.sendMessage(
        { action: "getComments", url: window.location.href }
    ).then(response => {
        const commentsList = document.getElementById('comments-list');
        // Clear the existing comments
        while (commentsList.firstChild) {
            commentsList.removeChild(commentsList.firstChild);
        }
        
        if (response.error) {
            const errorPara = document.createElement('p');
            errorPara.className = 'no-comments';
            errorPara.textContent = `Error loading comments: ${response.error}`;
            commentsList.appendChild(errorPara);
            return;
        }
        
        if (response.isEmpty || !response.comments || response.comments.length === 0) {
            const noPara = document.createElement('p');
            noPara.className = 'no-comments';
            noPara.textContent = 'No comments yet. Be the first to share your insights about this property!';
            commentsList.appendChild(noPara);
            return;
        }
        
        response.comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.dataset.id = comment.id;
            
            const date = new Date(comment.timestamp);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            const commentHeader = document.createElement('div');
            commentHeader.className = 'comment-header';
            
            const authorSpan = document.createElement('span');
            authorSpan.className = 'comment-author';
            authorSpan.textContent = comment.username;
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'comment-date';
            dateSpan.textContent = formattedDate;
            
            commentHeader.appendChild(authorSpan);
            commentHeader.appendChild(dateSpan);
            
            const commentText = document.createElement('div');
            commentText.className = 'comment-text';
            commentText.textContent = comment.text;
            
            commentElement.appendChild(commentHeader);
            commentElement.appendChild(commentText);
            
            commentsList.appendChild(commentElement);
        });
    });
}

function submitComment() {
    const commentText = document.getElementById('new-comment').value.trim();
    const username = document.getElementById('reacom-name').value.trim();
    
    if (!commentText) {
        alert('Please enter a comment before submitting.');
        return;
    }
    
    // Show loading indicator
    const submitBtn = document.getElementById('submit-comment-btn');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Posting...';
    submitBtn.disabled = true;
    
    const comment = {
        text: commentText,
        timestamp: new Date().toISOString(),
        username: username || "Anonymous"
    };
    
    browserAPI.runtime.sendMessage(
        { 
            action: "saveComment", 
            url: window.location.href,
            comment: comment 
        }
    ).then(response => {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
        
        if (response.status === "success") {
            document.getElementById('new-comment').value = '';
            loadComments();
        } else {
            alert(`Failed to save comment: ${response.message || 'Unknown error'}`);
        }
    });
}

// Function to handle URL changes
function handleUrlChange() {
    if (isPropertyPage()) {
        // We're on a property page, ensure panel exists
        if (!document.getElementById('property-comments-panel')) {
            createCommentsPanel();
        } else {
            // Panel exists but may need to refresh comments for new property
            loadComments();
        }
    } else {
        // Not on a property page, remove panel if it exists
        const panel = document.getElementById('property-comments-panel');
        if (panel) panel.remove();
    }
}

// Set up URL change detection
let lastUrl = window.location.href;
function checkForUrlChanges() {
    if (lastUrl !== window.location.href) {
        lastUrl = window.location.href;
        handleUrlChange();
    }
}

// Set up a MutationObserver to detect when the property details have fully loaded
function observePageChanges() {
    // Check for URL changes every 500ms
    setInterval(checkForUrlChanges, 500);
    
    // Also use a MutationObserver to detect DOM changes that might indicate page content has loaded
    const observer = new MutationObserver(function(mutations) {
        // Only act if we're on a property page but the panel isn't showing
        if (isPropertyPage() && !document.getElementById('property-comments-panel')) {
            // Check if the property details are loaded by looking for typical elements
            const propertyLoaded = document.querySelector('.property-info, .listing-details, .property-features');
            if (propertyLoaded) {
                createCommentsPanel();
                
                // Optional: If the page is fully loaded, we could disconnect the observer
                // observer.disconnect();
            }
        }
    });
    
    // Observe changes to the entire document
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize on page load
function initialize() {
    handleUrlChange(); // Check initial URL
    observePageChanges(); // Start observing for changes
}

// Update initialization logic
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}