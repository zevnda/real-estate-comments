// CSS files are bundled as text (see scripts/build.ts) and injected into the UI's shadow root
declare module '*.css' {
  const css: string
  export default css
}
