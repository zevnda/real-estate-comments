// The reviews' photos: `pnpm shitrentals images` downloads each one's large thumbnail from Airtable and converts it to
// WebP in .shitrentals/images/; `pnpm shitrentals upload` copies those to our R2 bucket. Both skip what's already done,
// so they can be run again after a new dry run.
import type { ImportedComment } from './parse.ts'

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AwsClient } from 'aws4fetch'
import sharp from 'sharp'

import { shitRentalsImageKey, shitRentalsImageUrl } from '../../src/shared/shitrentals.ts'
import { ShareSession } from './airtable.ts'

// Files never change once uploaded (their names are attachment IDs), so browsers and Cloudflare can keep them a year
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
// Between reviews, to stay gentle on Airtable
const PAUSE_MS = 300
const UPLOADS_AT_ONCE = 4

export async function downloadImages(comments: ImportedComment[], out: string): Promise<void> {
  const dir = join(out, 'images')
  mkdirSync(dir, { recursive: true })
  const wanted = comments
    .map(comment => ({ recordId: comment.sourceId, ids: comment.images.map(image => image.id) }))
    .map(({ recordId, ids }) => ({ recordId, ids: ids.filter(id => !existsSync(join(dir, `${id}.webp`))) }))
    .filter(({ ids }) => ids.length)
  const total = wanted.reduce((sum, { ids }) => sum + ids.length, 0)
  if (!total) {
    console.log('All images are already downloaded.')
    return
  }
  console.log(`Downloading ${total} images from ${wanted.length} reviews…`)

  const session = await ShareSession.open()
  let done = 0
  const failed: string[] = []
  for (const { recordId, ids } of wanted) {
    try {
      const thumbnails = await session.thumbnails(recordId)
      for (const id of ids) {
        const url = thumbnails.get(id)
        if (!url) {
          failed.push(`${recordId} ${id}: no thumbnail`)
          continue
        }
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${id}`)
        // .rotate() applies the photo's orientation before WebP drops its metadata (location, camera and so on)
        const webp = await sharp(Buffer.from(await response.arrayBuffer()))
          .rotate()
          .webp({ quality: 80 })
          .toBuffer()
        writeFileSync(join(dir, `${id}.webp`), webp)
        done++
      }
    } catch (error) {
      failed.push(`${recordId}: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.stdout.write(`\r${done}/${total}`)
    await new Promise(resolve => setTimeout(resolve, PAUSE_MS))
  }
  console.log(`\nDownloaded ${done} images to ${dir}.`)
  if (failed.length) console.log(`${failed.length} failed (run again to retry):\n  ${failed.join('\n  ')}`)
}

// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env (see .env.example)
export async function uploadImages(out: string): Promise<void> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error(
      'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env (see .env.example)',
    )
  }
  const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3' })
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`

  // What's been uploaded before, so a rerun only sends new images (each upload is a billed R2 operation)
  const dir = join(out, 'images')
  const logFile = join(out, 'uploaded.json')
  const uploaded = new Set(existsSync(logFile) ? (JSON.parse(readFileSync(logFile, 'utf8')) as string[]) : [])
  const ids = (existsSync(dir) ? readdirSync(dir) : [])
    .filter(file => file.endsWith('.webp'))
    .map(file => file.slice(0, -'.webp'.length))
    .filter(id => shitRentalsImageUrl(id) && !uploaded.has(id))
  if (!ids.length) {
    console.log('Nothing new to upload.')
    return
  }
  console.log(`Uploading ${ids.length} images to ${R2_BUCKET}…`)

  const failed: string[] = []
  const queue = [...ids]
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const response = await r2.fetch(`${endpoint}/${shitRentalsImageKey(id)}`, {
        method: 'PUT',
        body: readFileSync(join(dir, `${id}.webp`)),
        headers: { 'content-type': 'image/webp', 'cache-control': CACHE_CONTROL },
      })
      if (response.ok) uploaded.add(id)
      else failed.push(`${id}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
      process.stdout.write(`\r${uploaded.size}`)
    }
  }
  try {
    await Promise.all(Array.from({ length: UPLOADS_AT_ONCE }, worker))
  } finally {
    writeFileSync(logFile, JSON.stringify([...uploaded]) + '\n')
  }
  console.log(`\nUploaded ${ids.length - failed.length} images.`)
  if (failed.length) console.log(`${failed.length} failed (run again to retry):\n  ${failed.join('\n  ')}`)

  // The public URL, as the extension loads it
  const check = ids.find(id => uploaded.has(id))
  const url = check && shitRentalsImageUrl(check)
  if (url) {
    const response = await fetch(url)
    console.log(`Check: ${url} → HTTP ${response.status}, cache-control: ${response.headers.get('cache-control')}`)
  }
}
