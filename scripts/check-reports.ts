// Checks for comment reports made since the last check and, if there are any, posts a summary to a Discord webhook.
// Run daily by .github/workflows/check-reports.yml; also runs locally:
//
//   pnpm check-reports              # posts to DISCORD_WEBHOOK_URL if there are new reports
//   pnpm check-reports --dry-run    # prints the message instead
//   pnpm check-reports --always     # sends a summary even with no new reports (to test the webhook)
//
// Needs a service account key: FIREBASE_SERVICE_ACCOUNT_JSON (the key's JSON itself, as the workflow passes it) or
// FIREBASE_SERVICE_ACCOUNT (a path, as in .env). It only reads, so a key for a service account with the read-only
// "Cloud Datastore Viewer" role is enough. CHECK_SINCE (an ISO time) sets where the check starts; the workflow passes
// its last successful run, and without it the last 24 hours are checked.
//
// The message holds only counts and reasons, never comment text or report details: those are written by anyone, and
// stay in Firestore. Review them with `pnpm moderate`.
import type { ServiceAccount } from 'firebase-admin/app'
import type { Timestamp } from 'firebase-admin/firestore'

import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import { reportReasonLabel } from '../src/shared/reports.ts'

const DAY = 24 * 60 * 60 * 1000
const MAX_REPORTS = 500

interface ReportDoc {
  reason: string
  createdAt?: Timestamp
  status?: string
}

const dryRun = process.argv.includes('--dry-run')
const always = process.argv.includes('--always')
const webhook = process.env.DISCORD_WEBHOOK_URL
if (!dryRun && !webhook) {
  console.error('Set DISCORD_WEBHOOK_URL, or pass --dry-run.')
  process.exit(1)
}

const keyJson =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  (process.env.FIREBASE_SERVICE_ACCOUNT && readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, 'utf8'))
if (!keyJson) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON (the key) or FIREBASE_SERVICE_ACCOUNT (its path).')
  process.exit(1)
}

const since = process.env.CHECK_SINCE ? Date.parse(process.env.CHECK_SINCE) : Date.now() - DAY
if (Number.isNaN(since)) {
  console.error(`CHECK_SINCE isn't a valid time: ${process.env.CHECK_SINCE}`)
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(keyJson) as ServiceAccount) })
const snapshot = await getFirestore().collection('reports').orderBy('createdAt', 'desc').limit(MAX_REPORTS).get()
const reports = snapshot.docs.map(doc => doc.data() as ReportDoc)
// Open: not yet removed or dismissed by `pnpm moderate`
const open = reports.filter(report => !report.status)
const fresh = open.filter(report => (report.createdAt?.toMillis() ?? 0) > since)

console.log(`Since ${new Date(since).toISOString()}: ${fresh.length} new, ${open.length} open in total.`)
if (!fresh.length && !always) process.exit(0)

const reasons = new Map<string, number>()
for (const report of fresh) {
  const label = reportReasonLabel(report.reason)
  reasons.set(label, (reasons.get(label) ?? 0) + 1)
}
const oldest = Math.min(...open.map(report => report.createdAt?.toMillis() ?? Date.now()))
const oldestDays = Math.floor((Date.now() - oldest) / DAY)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const age = oldestDays === 0 ? 'from today' : `${plural(oldestDays, 'day')} old`

const message = [
  fresh.length
    ? `**${plural(fresh.length, 'new comment report')}** on Real Estate Comments`
    : '**No new comment reports** on Real Estate Comments',
  ...[...reasons].map(([reason, count]) => `- ${reason}: ${count}`),
  open.length
    ? `${plural(open.length, 'open report')} in total, the oldest ${age}. Aim to deal with each within 7 days.`
    : 'No open reports.',
  ...(open.length ? ['Review them with `pnpm moderate`.'] : []),
].join('\n')

if (dryRun) {
  console.log(`\n${message}`)
  process.exit(0)
}

const response = await fetch(webhook!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  // No pings from anything in the message
  body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
})
if (!response.ok) {
  console.error(`Discord webhook failed: ${response.status} ${await response.text()}`)
  process.exit(1)
}
console.log('Sent to Discord.')
