import { restorePanelState } from '../components/commentsPanel';

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

export function createSVGElement(path, vbWidth = 512, viewBoxHeight = 512) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("viewBox", `0 0 ${vbWidth} ${viewBoxHeight}`);
    svg.setAttribute("width", "32");
    svg.setAttribute("height", "32");
    svg.setAttribute("fill", "white");
    
    pathElement.setAttribute("d", path);
    svg.appendChild(pathElement);
    
    return svg;
}