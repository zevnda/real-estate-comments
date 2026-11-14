// Builds the extension into dist/chrome and dist/firefox, and the embed (src/embed/) into dist/relay, which the comment
// relay serves (see CLAUDE.md, "Embed"). Run with `pnpm build`, or `pnpm dev` to rebuild on change.
import type { BuildOptions, Plugin } from 'esbuild'
import type { Browser } from '../src/manifest.ts'

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { context } from 'esbuild'

import { createManifest } from '../src/manifest.ts'

const BROWSERS: Browser[] = ['chrome', 'firefox']
const TARGETS: Record<Browser, string> = { chrome: 'chrome123', firefox: 'firefox128' }

const watch = process.argv.includes('--watch')
const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string }

async function build(browser: Browser) {
  const outdir = join('dist', browser)
  await rm(outdir, { recursive: true, force: true })
  await mkdir(outdir, { recursive: true })
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify(createManifest(browser, version), null, 2))
  await cp('icons', join(outdir, 'icons'), { recursive: true, filter: source => !source.endsWith('icon-full.png') })
  await cp('src/options/options.html', join(outdir, 'options.html'))

  const options: BuildOptions = {
    entryPoints: {
      background: 'src/background/index.ts',
      content: 'src/content/index.tsx',
      options: 'src/options/index.ts',
    },
    outdir,
    bundle: true,
    // Classic scripts: content scripts can't be modules, and one format keeps both browsers' backgrounds the same
    format: 'iife',
    target: TARGETS[browser],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.css': 'text', '.md': 'text' },
    // Not minified: store reviewers (Firefox Add-ons especially) need to be able to read the shipped code
    minify: false,
    sourcemap: watch ? 'inline' : false,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    logLevel: 'info',
  }
  const ctx = await context(options)
  if (watch) {
    await ctx.watch()
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
  console.log(`Built ${browser} ${version} → ${outdir}`)
}

// The embed runs the extension's UI with the extension APIs swapped for src/embed/ext.ts (localStorage, and the
// relay instead of the background script)
const embedExt: Plugin = {
  name: 'embed-ext',
  setup(build) {
    const shared = resolve('src/shared/ext.ts')
    build.onResolve({ filter: /(^|\/)ext(\.ts)?$/ }, args => {
      const path = resolve(args.resolveDir, args.path.endsWith('.ts') ? args.path : `${args.path}.ts`)
      return path === shared ? { path: resolve('src/embed/ext.ts') } : undefined
    })
  },
}

async function buildEmbed() {
  const outdir = join('dist', 'relay')
  // Emptied rather than removed: `pnpm worker:dev` watches the folder, and on Windows that stops it being removed
  await mkdir(outdir, { recursive: true })
  for (const file of await readdir(outdir)) await rm(join(outdir, file), { recursive: true, force: true })
  // Partner themes' fonts (src/embed/themes/), served by the relay rather than a font service: Sora (OFL-1.1)
  await mkdir(join(outdir, 'fonts'), { recursive: true })
  await cp(
    'node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2',
    join(outdir, 'fonts', 'sora.woff2'),
  )
  const ctx = await context({
    entryPoints: { embed: 'src/embed/index.tsx' },
    outdir,
    bundle: true,
    format: 'iife',
    // light-dark() and :has(), like the extension's minimum versions
    target: ['chrome123', 'firefox128', 'safari17.5'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.css': 'text', '.md': 'text' },
    // A web page, not reviewed by a store, so minified
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'), '__EMBED__': 'true' },
    plugins: [embedExt],
    logLevel: 'info',
  })
  if (watch) {
    await ctx.watch()
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
  console.log(`Built the embed → ${outdir}`)
}

await Promise.all([...BROWSERS.map(build), buildEmbed()])
if (watch) console.log('Watching for changes… (reload the extension and refresh the page after each rebuild)')
