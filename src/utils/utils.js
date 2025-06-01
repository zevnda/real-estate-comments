export function isPropertyPage() {
    return window.location.href.includes('realestate.com.au/property-');
}

export function handleUrlChange(createCommentsPanel, loadComments) {
    if (isPropertyPage()) {
        if (!document.getElementById('property-comments-panel')) {
            createCommentsPanel();
        } else {
            loadComments();
        }
        if (!document.getElementById('property-comments-bubble')) {
            createCommentsPanel();
        }
        restorePanelState();
    } else {
        const panel = document.getElementById('property-comments-panel');
        if (panel) panel.remove();
        const bubble = document.getElementById('property-comments-bubble');
        if (bubble) bubble.remove();
    }
}
