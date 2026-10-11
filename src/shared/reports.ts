// Reasons for reporting a comment. The IDs are stored in `reports` documents and listed in the Firestore security
// rules (firestore.rules), so never rename or remove one: add a new one, and add it to the rules first.
export const REPORT_REASONS = [
  { id: 'identifies-person', label: 'Names or identifies a private person' },
  { id: 'defamatory', label: 'Defamatory, or makes accusations about someone' },
  { id: 'harassment', label: 'Harassing, threatening or discriminatory' },
  { id: 'personal-info', label: 'Personal information or private documents' },
  { id: 'spam', label: 'Spam, advertising or not about the property' },
  { id: 'other', label: 'Something else' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['id']

export const REPORT_DETAILS_MAX_LENGTH = 1000

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.some(reason => reason.id === value)
}

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find(reason => reason.id === id)?.label ?? id
}
