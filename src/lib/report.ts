import type { ReportReason } from '@/types/api'

/**
 * The vocabulary of a report, and what the form will and will not accept.
 *
 * The reason is the triage handle and the details are the evidence — that split is the server's,
 * and it is why the reason is required while the text is not. The labels here are the only place
 * the enum is turned into something a person would say; a `Record` keyed by the union means the
 * compiler refuses a reason that has no wording, which is the failure that would otherwise ship
 * as a blank radio button.
 */

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  HARASSMENT: 'Harassment',
  SPAM: 'Spam',
  SCAM: 'Scam or fraud',
  INAPPROPRIATE_CONTENT: 'Inappropriate content',
  OTHER: 'Something else',
}

/**
 * A second line under each option. Reports are triaged by somebody who was not there, so the
 * difference between "spam" and "scam" is worth spelling out at the moment of choosing.
 */
export const REPORT_REASON_HINTS: Record<ReportReason, string> = {
  HARASSMENT: 'Abusive, threatening or persistent unwanted messages.',
  SPAM: 'Advertising, repetition, or messages sent to everybody.',
  SCAM: 'An attempt to take money or details dishonestly.',
  INAPPROPRIATE_CONTENT: 'A listing or profile carrying something that does not belong here.',
  OTHER: 'Anything the list above does not cover. Please say what happened.',
}

/**
 * 1000, not the 255 nearly every other text field on this API carries.
 *
 * Worth stating rather than assuming: a report is the one place somebody is asked to describe
 * something that happened, and a cap that silently truncated an account of it would be the worst
 * possible field to get wrong.
 */
export const REPORT_DETAILS_MAX = 1000

export interface ReportDraft {
  reason: ReportReason | ''
  details: string
}

export function emptyReport(): ReportDraft {
  return { reason: '', details: '' }
}

export interface ReportProblems {
  reason?: string
  details?: string
}

/**
 * What the server would refuse.
 *
 * `OTHER` is the one reason that asks for the text as well. Nothing on the server requires it —
 * `details` is optional whichever reason is chosen — so this is the client being stricter on
 * purpose: "something else" with no description is a queue row staff cannot act on, and the
 * moment to ask is while the person still remembers.
 */
export function reportProblems(draft: ReportDraft): ReportProblems {
  const problems: ReportProblems = {}

  if (draft.reason === '') problems.reason = 'Choose a reason.'
  else if (draft.reason === 'OTHER' && draft.details.trim() === '') {
    problems.details = 'Please say what happened, so this can be acted on.'
  }

  if (draft.details.length > REPORT_DETAILS_MAX) {
    problems.details = `Reports are limited to ${REPORT_DETAILS_MAX} characters.`
  }

  return problems
}

export function hasReportProblems(problems: ReportProblems): boolean {
  return Object.keys(problems).length > 0
}
