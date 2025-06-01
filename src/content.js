import browserAPI from './browser-polyfill.js';

// Check if current URL is a property page
function isPropertyPage() {
    return window.location.href.includes('realestate.com.au/property-');
}

// Create and inject the comments panel
function createCommentsPanel() {
    // Check if panel already exists
    if (document.getElementById('property-comments-panel')) {
        return;
    }
    // Only create panel if we're on a property page
    if (!isPropertyPage()) {
        return;
    }

    // --- Create floating bubble ---
    let bubble = document.getElementById('property-comments-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'property-comments-bubble';
        bubble.className = 'property-comments-bubble';
        bubble.textContent = 'Show';
        bubble.style.display = 'none';
        document.body.appendChild(bubble);
        bubble.addEventListener('click', function() {
            showCommentsPanel();
        });
    }

    // --- Create floating chat panel ---
    const panel = document.createElement('div');
    panel.id = 'property-comments-panel';

    // Check saved states before assigning class
    const savedState = localStorage.getItem('comments-panel-state');
    panel.className = savedState === 'minimized'
        ? 'property-comments-floating minimized'
        : 'property-comments-floating expanded';

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
    donateLink.href = 'https://buymeacoffee.com/zevnda';
    donateLink.target = '_blank';
    donateLink.textContent = 'By Me A Coffee';

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
                // Only toggle if clicking header, not controls
                if (event.target.closest('.header-controls')) return;
                toggleCommentsPanel();
            });

            const caret = document.querySelector('.header-caret');
            if (caret && savedState === 'minimized') {
                caret.innerHTML = '▲';
            }
        }

        const submitBtn = document.getElementById('submit-comment-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', submitComment);
        }
    }, 100);

    // Show/hide panel or bubble based on state
    updatePanelAndBubbleVisibility();

    // Load comments for this page
    loadComments();
}

function showCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (panel) {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        localStorage.setItem('comments-panel-state', 'expanded');
        updatePanelAndBubbleVisibility();
        // Restore caret
        const caret = document.querySelector('.header-caret');
        if (caret) caret.innerHTML = '▼';
    }
    if (bubble) bubble.style.display = 'none';
}

function hideCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (panel) {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        localStorage.setItem('comments-panel-state', 'minimized');
        updatePanelAndBubbleVisibility();
        // Restore caret
        const caret = document.querySelector('.header-caret');
        if (caret) caret.innerHTML = '▲';
    }
    if (bubble) bubble.style.display = '';
}

function toggleCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    if (!panel) return;
    if (panel.classList.contains('expanded')) {
        hideCommentsPanel();
    } else {
        showCommentsPanel();
    }
}

function updatePanelAndBubbleVisibility() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (!panel || !bubble) return;
    // Always keep panel in DOM for animation
    if (panel.classList.contains('expanded')) {
        panel.style.visibility = '';
        bubble.style.display = 'none';
    } else {
        panel.style.visibility = '';
        bubble.style.display = '';
    }
}

function restorePanelState() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    const savedState = localStorage.getItem('comments-panel-state');
    const caret = document.querySelector('.header-caret');
    if (!panel || !bubble) return;
    if (savedState === 'minimized') {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        if (caret) caret.innerHTML = '▲';
    } else {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        if (caret) caret.innerHTML = '▼';
    }
    updatePanelAndBubbleVisibility();
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

    // Loading indicator
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

// Handle URL changes
function handleUrlChange() {
    if (isPropertyPage()) {
        // We're on a property page, ensure panel exists
        if (!document.getElementById('property-comments-panel')) {
            createCommentsPanel();
        } else {
            // Panel exists but may need to refresh comments for new property
            loadComments();
        }
        // Always ensure bubble exists
        if (!document.getElementById('property-comments-bubble')) {
            createCommentsPanel();
        }
        restorePanelState();
    } else {
        // Not on a property page, remove panel and bubble if they exist
        const panel = document.getElementById('property-comments-panel');
        if (panel) panel.remove();
        const bubble = document.getElementById('property-comments-bubble');
        if (bubble) bubble.remove();
    }
}

// URL change detection
let lastUrl = window.location.href;
function checkForUrlChanges() {
    if (lastUrl !== window.location.href) {
        lastUrl = window.location.href;
        handleUrlChange();
    }
}

// Set up observer to detect when the property details have fully loaded
function observePageChanges() {
    // Check for URL changes every 500ms
    setInterval(checkForUrlChanges, 500);

    // Also use an observer to detect DOM changes that might indicate page content has loaded
    const observer = new MutationObserver(function(mutations) {
        if (isPropertyPage() && !document.getElementById('property-comments-panel')) {
            // Check if the property details are loaded by looking for typical elements
            const propertyLoaded = document.querySelector('.property-info, .listing-details, .property-features');
            if (propertyLoaded) {
                createCommentsPanel();
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize on page load
function initialize() {
    handleUrlChange();
    observePageChanges();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}