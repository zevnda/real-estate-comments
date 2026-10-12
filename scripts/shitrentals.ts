// ShitRentals reviews → our comments. See CLAUDE.md → "ShitRentals reviews".
//
//   pnpm shitrentals dry-run [--offline]
//   pnpm shitrentals emulator
//   pnpm shitrentals images
//   pnpm shitrentals upload
//
// dry-run reads every property review from ShitRentals' Airtable, converts it, and writes what would be imported to
// .shitrentals/ (git-ignored): comments.json (the documents, as they'd be written) and report.md (counts, everything
// skipped and why, every correction). Nothing is written to Firestore or anywhere else. --offline reuses the reviews
// from the last run instead of fetching them again, for iterating on the parser or overrides.
//
// emulator starts the local Firebase emulators with comments.json and a copy of the real comments, for the emulator
// build of the extension (`pnpm build:emulator`). It runs until Ctrl+C and keeps nothing.
//
// images downloads the photos of the reviews in comments.json (up to 4 each) and converts them to WebP in
// .shitrentals/images/; upload copies them to our R2 bucket (needs the R2_ settings in .env). Both skip what's done.
//
// Fixes for single reviews go in scripts/shitrentals/overrides.json, by record ID:
//   { "recXXXX": { "address": "12 smith street", "suburb": "Oakleigh", "postcode": "3166" }, "recYYYY": { "skip": "why" } }
import type { ImportedComment, Override, SkipReason, SourceRecord } from './shitrentals/parse.ts'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ShareSession } from './shitrentals/airtable.ts'
import { runEmulator } from './shitrentals/emulator.ts'
import { downloadImages, uploadImages } from './shitrentals/images.ts'
import { buildPostcodeIndex, parseRecord } from './shitrentals/parse.ts'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, '.shitrentals')
const OVERRIDES = join(import.meta.dirname, 'shitrentals', 'overrides.json')
// Pinned, so a run gives the same postcodes until this is deliberately updated. Only downloaded to .shitrentals/ and
// read here; it's never committed or bundled.
const POSTCODES_URL =
  'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/eda59e4a987d46dbfb1d6bc644a383d322aa3d8d/australian_postcodes.csv'

const [command, ...flags] = process.argv.slice(2)
if (command === 'dry-run') {
  await dryRun(flags.includes('--offline'))
} else if (command === 'emulator') {
  await runEmulator(converted())
} else if (command === 'images') {
  await downloadImages(converted(), OUT)
} else if (command === 'upload') {
  await uploadImages(OUT)
} else {
  console.error('Usage: pnpm shitrentals dry-run [--offline] | emulator | images | upload')
  process.exit(1)
}

// The reviews from the last dry run
function converted(): ImportedComment[] {
  const file = join(OUT, 'comments.json')
  if (!existsSync(file)) throw new Error('No converted reviews yet: run `pnpm shitrentals dry-run` first')
  return JSON.parse(readFileSync(file, 'utf8')) as ImportedComment[]
}

async function dryRun(offline: boolean): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const records = await loadRecords(offline)
  const index = buildPostcodeIndex(await loadPostcodes())
  const overrides = existsSync(OVERRIDES)
    ? (JSON.parse(readFileSync(OVERRIDES, 'utf8')) as Record<string, Override>)
    : {}

  const imported: { record: SourceRecord; comment: ImportedComment; notes: string[] }[] = []
  const skipped: { record: SourceRecord; reason: SkipReason; detail: string }[] = []
  for (const record of records) {
    const result = parseRecord(record, index, overrides[record.id])
    if (result.ok) imported.push({ record, comment: result.comment, notes: result.notes })
    else skipped.push({ record, reason: result.reason, detail: result.detail })
  }

  writeFileSync(
    join(OUT, 'comments.json'),
    JSON.stringify(
      imported.map(item => item.comment),
      null,
      2,
    ) + '\n',
  )
  writeFileSync(join(OUT, 'report.md'), report(records, imported, skipped))
  console.log(`${records.length} reviews: ${imported.length} would be imported, ${skipped.length} skipped`)
  console.log(`Wrote ${join(OUT, 'comments.json')} and ${join(OUT, 'report.md')}`)
}

async function loadRecords(offline: boolean): Promise<SourceRecord[]> {
  const file = join(OUT, 'source.json')
  if (offline) {
    if (!existsSync(file)) throw new Error('No saved reviews yet: run without --offline first')
    return JSON.parse(readFileSync(file, 'utf8')) as SourceRecord[]
  }
  console.log('Fetching reviews from Airtable…')
  const records = await (await ShareSession.open()).records()
  writeFileSync(file, JSON.stringify(records, null, 1) + '\n')
  return records
}

async function loadPostcodes(): Promise<string> {
  const file = join(OUT, 'postcodes.csv')
  if (!existsSync(file)) {
    console.log('Downloading the postcode list…')
    const response = await fetch(POSTCODES_URL)
    if (!response.ok) throw new Error(`Postcode list: HTTP ${response.status}`)
    writeFileSync(file, await response.text())
  }
  return readFileSync(file, 'utf8')
}

function report(
  records: SourceRecord[],
  imported: { record: SourceRecord; comment: ImportedComment; notes: string[] }[],
  skipped: { record: SourceRecord; reason: SkipReason; detail: string }[],
): string {
  const comments = imported.map(item => item.comment)
  const properties = new Map<string, number>()
  for (const { address, suburb, postcode } of comments) {
    const key = [address, suburb, postcode].join('|')
    properties.set(key, (properties.get(key) ?? 0) + 1)
  }
  const reasons = new Map<SkipReason, typeof skipped>()
  for (const item of skipped) reasons.set(item.reason, [...(reasons.get(item.reason) ?? []), item])
  const link = (record: SourceRecord) => `[${record.id}](${comments[0]?.url.replace(/rec\w+$/, '') ?? ''}${record.id})`
  const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '(empty)'
  const raw = (record: SourceRecord) => `${cell(record.address)} · ${cell(record.suburb)} ${record.state}`
  const imageCount = comments.reduce((sum, comment) => sum + comment.images.length, 0)
  const sample = imported.filter((_, i) => i % Math.max(1, Math.floor(imported.length / 40)) === 0).slice(0, 40)

  return [
    `# ShitRentals dry run`,
    ``,
    `${new Date().toISOString()}. Nothing was written anywhere; this is what an import would do.`,
    ``,
    `| | Count |`,
    `| --- | --- |`,
    `| Reviews read | ${records.length} |`,
    `| **Would be imported** | **${imported.length}** |`,
    `| … on distinct properties | ${properties.size} (${[...properties.values()].filter(n => n > 1).length} with several reviews) |`,
    `| … without a postcode (suburb split between postcodes, or its name shared by other places) | ${comments.filter(c => !c.postcode).length} |`,
    `| … corrected (suburb or street type) | ${imported.filter(item => item.notes.length).length} |`,
    `| … shortened, with "View more on ShitRentals" | ${comments.filter(c => c.text.includes('View more on')).length} |`,
    `| … with images (images to copy, ≤ 4 each) | ${comments.filter(c => c.images.length).length} (${imageCount}) |`,
    `| Skipped | ${skipped.length} |`,
    ...[...reasons]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([reason, items]) => `| … ${reason} | ${items.length} |`),
    ``,
    `To fix a review by hand, add it to \`scripts/shitrentals/overrides.json\` and run \`pnpm shitrentals dry-run --offline\`.`,
    ``,
    `## Skipped`,
    ``,
    ...[...reasons]
      .filter(([reason]) => reason !== 'not in Australia')
      .flatMap(([reason, items]) => [
        `### ${reason} (${items.length})`,
        ``,
        `| Record | As typed | Detail |`,
        `| --- | --- | --- |`,
        ...items.map(({ record, detail }) => `| ${link(record)} | ${raw(record)} | ${cell(detail)} |`),
        ``,
      ]),
    `## Corrections`,
    ``,
    `| Record | As typed | Imported as | Notes |`,
    `| --- | --- | --- | --- |`,
    ...imported
      .filter(item => item.notes.length)
      .map(
        ({ record, comment, notes }) =>
          `| ${link(record)} | ${raw(record)} | ${located(comment)} | ${cell(notes.join('; '))} |`,
      ),
    ``,
    `## Sample of imported reviews`,
    ``,
    `| Record | As typed | Imported as |`,
    `| --- | --- | --- |`,
    ...sample.map(({ record, comment }) => `| ${link(record)} | ${raw(record)} | ${located(comment)} |`),
    ``,
  ].join('\n')
}

function located(comment: ImportedComment): string {
  return `${comment.address} · ${comment.suburb} ${comment.state.toUpperCase()} ${comment.postcode ?? '(no postcode)'}`
}
