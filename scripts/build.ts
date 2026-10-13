// Builds the extension into dist/chrome and dist/firefox. Run with `pnpm build`, or `pnpm dev` to rebuild on change.
import type { BuildOptions } from 'esbuild'
import type { Browser } from '../src/manifest.ts'

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
