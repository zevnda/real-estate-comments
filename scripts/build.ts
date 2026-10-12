// Builds the extension into dist/chrome and dist/firefox. Run with `pnpm build`, or `pnpm dev` to rebuild on change.
// `pnpm build:emulator` builds dist/chrome-emulator instead: Chrome only, using the local Firebase emulators
// (`pnpm shitrentals emulator`), and named so it can't be mistaken for the real one.
import type { BuildOptions, Plugin } from 'esbuild'
import type { Browser } from '../src/manifest.ts'

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { context } from 'esbuild'

import { createManifest } from '../src/manifest.ts'

const TARGETS: Record<Browser, string> = { chrome: 'chrome123', firefox: 'firefox128' }

const watch = process.argv.includes('--watch')
const emulator = process.argv.includes('--emulator')
const BROWSERS: Browser[] = emulator ? ['chrome'] : ['chrome', 'firefox']
const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string }

// The emulator build's Firebase connection: src/background/emulator.ts (which does nothing) is swapped for
// scripts/emulator-firebase.ts, so the code that connects to the emulators is only ever in that build
const useEmulators: Plugin = {
  name: 'use-emulators',
  setup(build) {
    build.onResolve({ filter: /^\.\/emulator$/ }, args =>
      args.importer.endsWith(join('background', 'firebase.ts'))
        ? { path: resolve('scripts', 'emulator-firebase.ts') }
        : undefined,
    )
  },
}

async function build(browser: Browser) {
  const outdir = join('dist', emulator ? `${browser}-emulator` : browser)
  await rm(outdir, { recursive: true, force: true })
  await mkdir(outdir, { recursive: true })
  const manifest = createManifest(browser, version)
  if (emulator) manifest.name = `${String(manifest.name)} (emulator)`
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await cp('icons', join(outdir, 'icons'), { recursive: true, filter: source => !source.endsWith('icon-full.png') })

  const options: BuildOptions = {
    entryPoints: { background: 'src/background/index.ts', content: 'src/content/index.tsx' },
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
    plugins: emulator ? [useEmulators] : [],
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

await Promise.all(BROWSERS.map(build))
if (watch) console.log('Watching for changes… (reload the extension and refresh the page after each rebuild)')
