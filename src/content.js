// Create and inject the comments panel
function createCommentsPanel() {
    // Check if panel already exists, if so, don't create another one
    if (document.getElementById('property-comments-panel')) {
        return;
    }
    
    const panel = document.createElement('div');
    panel.id = 'property-comments-panel';
    
    // Check saved states before assigning class
    const savedState = localStorage.getItem('comments-panel-state');
    panel.className = savedState === 'minimized' 
        ? 'property-comments-container minimized' 
        : 'property-comments-container expanded';
    
    panel.innerHTML = `
        <div class="property-comments-header">
            <div class="header-title">
                <span class="header-caret">▼</span>
                <h3>Property Comments</h3>
            </div>
            <div class="header-controls">
                <button id="fullscreen-comments-btn" title="Toggle fullscreen"><i>⛶</i></button>
            </div>
        </div>
        <div class="property-comments-body">
            <div id="comments-list"></div>
            <div class="property-comments-form">
                <input type="text" id="reacom-name" placeholder="Your name (optional)">
                <textarea id="new-comment" placeholder="Share your thoughts about this property..."></textarea>
                <button id="submit-comment-btn">Submit</button>
            </div>
        </div>
    `;
    
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
    chrome.runtime.sendMessage(
        { action: "getComments", url: window.location.href },
        (response) => {
            const commentsList = document.getElementById('comments-list');
            commentsList.innerHTML = '';
            
            if (response.error) {
                commentsList.innerHTML = `<p class="no-comments">Error loading comments: ${response.error}</p>`;
                return;
            }
            
            if (response.isEmpty || !response.comments || response.comments.length === 0) {
                commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first to share your insights about this property!</p>';
                return;
            }
            
            response.comments.forEach(comment => {
                const commentElement = document.createElement('div');
                commentElement.className = 'comment';
                commentElement.dataset.id = comment.id;
                
                const date = new Date(comment.timestamp);
                const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                
                commentElement.innerHTML = `
                    <div class="comment-header">
                        <span class="comment-author">${comment.username}</span>
                        <span class="comment-date">${formattedDate}</span>
                    </div>
                    <div class="comment-text">${comment.text}</div>
                `;
                
                commentsList.appendChild(commentElement);
            });
        }
    );
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
    
    chrome.runtime.sendMessage(
        { 
            action: "saveComment", 
            url: window.location.href,
            comment: comment 
        },
        (response) => {
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
            
            if (response.status === "success") {
                document.getElementById('new-comment').value = '';
                loadComments();
            } else {
                alert(`Failed to save comment: ${response.message || 'Unknown error'}`);
            }
        }
    );
}

document.addEventListener('DOMContentLoaded', function() {
    createCommentsPanel();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    createCommentsPanel();
}