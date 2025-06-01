# Real Estate Comments Extension

This browser extension adds a comment section to [https://www.realestate.com.au](https://www.realestate.com.au) property listings, allowing users to view and submit comments about properties to give potential renters an idea of what the property conditions are really like.

## Installation - Chrome Web Store/Firefox Add-ons

1. Download the extension from
  - **Chome Web Store**: *coming soon..*
  - **Firefox Add-ons**: *coming soon..*
2. Install and enable the extension in your browser
3. Refresh any open realestate.com.au tabs

## Installation - Unpacked

### Chrome
1. [Download](https://github.com/zevnda/realestate-comments/releases/latest) or clone this repository to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and active

### Firefox
1. [Download](https://github.com/zevnda/realestate-comments/releases/latest) or clone this repository to your computer
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to the extension directory and select the `manifest.json` file
5. The extension should now be installed temporarily (will be removed when Firefox closes)

## Usage

- Navigate to a property listing on [https://www.realestate.com.au](https://www.realestate.com.au)
- A blue/white comment button will appear in the bottom-right of the listing page
- Click the button to view other users' comments or create your own comment

## Build from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher)
- npm or pnpm package manager

1. Clone the repository
```bash
git clone https://github.com/zevnda/realestate-comments.git
cd realestate-comments
```

2. Install dependencies 
```bash
npm install
# or if using pnpm
pnpm install
```

3. Build the extension
```bash
npm run build
# or if using pnpm
pnpm build
```

This will create:
- `dist/chrome/` - Chrome extension files
- `dist/firefox/` - Firefox extension files

4. Load the extension in your browser following the `Installation - Unpacked` instructions above