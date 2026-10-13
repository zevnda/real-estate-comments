import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { isReportReason, REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS, reportReasonLabel } from '../src/shared/reports'

describe('report reasons', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

  it('match the security rules exactly', () => {
    const listed = rules.match(/data\.reason in \[([^\]]*)\]/)?.[1]
    const ids = [...(listed ?? '').matchAll(/'([^']+)'/g)].map(match => match[1])
    expect(ids).toEqual(REPORT_REASONS.map(reason => reason.id))
  })

  it('use the same details limit as the security rules', () => {
    expect(rules).toContain(`data.details.size() <= ${REPORT_DETAILS_MAX_LENGTH}`)
  })

  it('are validated and labelled', () => {
    expect(isReportReason('spam')).toBe(true)
    expect(isReportReason('nope')).toBe(false)
    expect(isReportReason(undefined)).toBe(false)
    expect(reportReasonLabel('defamatory')).toMatch(/Defamatory/)
    expect(reportReasonLabel('unknown')).toBe('unknown')
  })
})
