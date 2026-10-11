// CSS files are bundled as text (see scripts/build.ts) and injected into the UI's shadow root
declare module '*.css' {
  const css: string
  export default css
}

// CHANGELOG.md is bundled as text, for the panel's "What's new" dialog
declare module '*.md' {
  const markdown: string
  export default markdown
}
