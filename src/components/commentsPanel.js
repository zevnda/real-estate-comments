import { createSVGElement, isPropertyPage } from '../utils/utils.js';
import { loadComments, submitComment } from './comments.js';

// Change to export
export function handleOutsideClick(e) {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (!panel || !bubble) return;

    // Check if click is outside panel and panel is expanded
    if (!panel.contains(e.target) && !bubble.contains(e.target) && panel.classList.contains('expanded')) {
        hideCommentsPanel();
    }
}

// Create and inject the comments panel
export function createCommentsPanel() {
    // Check if panel already exists
    if (document.getElementById('property-comments-panel')) {
        return;
    }
    // Only create panel if we're on a property page
    if (!isPropertyPage()) {
        return;
    }

    // Create floating bubble
    let bubble = document.getElementById('property-comments-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'property-comments-bubble';
        bubble.className = 'property-comments-bubble';
        const svgPath = "M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z";
        bubble.appendChild(createSVGElement(svgPath));
        bubble.style.display = localStorage.getItem('comments-panel-state') === 'expanded' ? 'none' : '';
        document.body.appendChild(bubble);
        bubble.addEventListener('click', function() {
            showCommentsPanel();
        });
    }

    // Create floating main panel
    const panel = document.createElement('div');
    panel.id = 'property-comments-panel';

    // Check saved states before assigning class
    const savedState = localStorage.getItem('comments-panel-state');
    panel.className = savedState === 'minimized'
        ? 'property-comments-floating minimized'
        : 'property-comments-floating expanded';

    // Create panel header
    const header = document.createElement('div');
    header.className = 'property-comments-header';

    const headerTitle = document.createElement('div');
    headerTitle.className = 'header-title';
    const titleText = document.createElement('p');
    titleText.textContent = 'Property Comments';
    headerTitle.appendChild(titleText);

    const headerControls = document.createElement('div');
    headerControls.className = 'header-controls';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-close-btn';
    const closeSvg = createSVGElement("M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z");
    closeBtn.appendChild(closeSvg);
    headerControls.appendChild(closeBtn);

    header.appendChild(headerTitle);
    header.appendChild(headerControls);

    // Create panel body
    const body = document.createElement('div');
    body.className = 'property-comments-body';

    const commentsList = document.createElement('div');
    commentsList.id = 'comments-list';

    const form = document.createElement('div');
    form.className = 'property-comments-form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'reacom-name';
    nameInput.placeholder = 'Your name (optional)';

    const textarea = document.createElement('textarea');
    textarea.id = 'new-comment';
    textarea.placeholder = 'Share your thoughts about this property...';

    const charCounter = document.createElement('div');
    charCounter.className = 'char-counter';
    charCounter.textContent = '0/500 characters';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    const donateBtn = document.createElement('a');
    donateBtn.id = 'donate-btn';
    donateBtn.href = 'https://buymeacoffee.com/zevnda';
    donateBtn.target = '_blank';
    const coffeeSvg = createSVGElement("M96 64c0-17.7 14.3-32 32-32l320 0 64 0c70.7 0 128 57.3 128 128s-57.3 128-128 128l-32 0c0 53-43 96-96 96l-192 0c-53 0-96-43-96-96L96 64zM480 224l32 0c35.3 0 64-28.7 64-64s-28.7-64-64-64l-32 0 0 128zM32 416l512 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 480c-17.7 0-32-14.3-32-32s14.3-32 32-32z", "640");
    coffeeSvg.setAttribute('width', '22');
    coffeeSvg.setAttribute('height', '22');
    donateBtn.appendChild(coffeeSvg);
    donateBtn.appendChild(document.createTextNode('Buy Me A Coffee'));

    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit-comment-btn';
    submitBtn.textContent = 'Submit';

    buttonContainer.appendChild(donateBtn);
    buttonContainer.appendChild(submitBtn);

    form.appendChild(nameInput);
    form.appendChild(textarea);
    form.appendChild(charCounter);
    form.appendChild(buttonContainer);

    body.appendChild(commentsList);
    body.appendChild(form);

    panel.appendChild(header);
    panel.appendChild(body);

    document.body.appendChild(panel);
    
    // Add click listener if panel starts expanded
    if (!panel.classList.contains('minimized')) {
        document.addEventListener('click', handleOutsideClick);
    }

    setTimeout(() => {
        const submitBtn = document.getElementById('submit-comment-btn');
        const closeBtn = document.querySelector('.panel-close-btn');
        
        if (submitBtn) {
            submitBtn.addEventListener('click', submitComment);
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', hideCommentsPanel);
        }
        
        // Add character counter logic
        const textarea = document.getElementById('new-comment');
        const charCounter = document.querySelector('.char-counter');
        if (textarea) {
            textarea.addEventListener('input', () => {
                const count = textarea.value.length;
                charCounter.textContent = `${count}/500 characters`;
                charCounter.style.color = count > 500 ? '#d32f2f' : '#5f6368';
            });
        }
    }, 100);

    // Show/hide panel or bubble based on state
    updatePanelAndBubbleVisibility();

    // Load comments for this page
    loadComments();
}

export function showCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (panel) {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        localStorage.setItem('comments-panel-state', 'expanded');
        updatePanelAndBubbleVisibility();
        // Add click listener when showing
        document.addEventListener('click', handleOutsideClick);
    }
    if (bubble) bubble.style.opacity = '0';
}

export function hideCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (panel) {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        localStorage.setItem('comments-panel-state', 'minimized');
        updatePanelAndBubbleVisibility();
        // Remove click listener when hiding
        document.removeEventListener('click', handleOutsideClick);
    }
    if (bubble) bubble.style.display = '';
}

export function toggleCommentsPanel() {
    const panel = document.getElementById('property-comments-panel');
    if (!panel) return;
    if (panel.classList.contains('expanded')) {
        hideCommentsPanel();
    } else {
        showCommentsPanel();
    }
}

export function updatePanelAndBubbleVisibility() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    if (!panel || !bubble) return;

    if (panel.classList.contains('expanded')) {
        panel.style.visibility = '';
        bubble.style.opacity = '0';
        bubble.classList.remove('visible');
    } else {
        panel.style.visibility = '';
        bubble.style.opacity = '1';
        bubble.classList.add('visible');
    }
}

export function restorePanelState() {
    const panel = document.getElementById('property-comments-panel');
    const bubble = document.getElementById('property-comments-bubble');
    const savedState = localStorage.getItem('comments-panel-state');
    if (!panel || !bubble) return;
    
    if (savedState === 'minimized') {
        panel.classList.remove('expanded');
        panel.classList.add('minimized');
        document.removeEventListener('click', handleOutsideClick);
    } else {
        panel.classList.remove('minimized');
        panel.classList.add('expanded');
        document.addEventListener('click', handleOutsideClick);
    }
    updatePanelAndBubbleVisibility();
}