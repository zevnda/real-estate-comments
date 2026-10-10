// Bumps the patch version in package.json (the manifests read it at build time). Firefox Add-ons refuses to sign a
// version number it has already seen for this add-on, so `pnpm sign` runs this first.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const [major, minor, patch] = pkg.version.split('.').map(Number)
const version = `${major}.${minor}.${(patch ?? 0) + 1}`
writeFileSync('package.json', JSON.stringify({ ...pkg, version }, null, 2) + '\n')
console.log(`Version ${pkg.version} → ${version}`)
