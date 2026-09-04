import { describe, expect, it } from 'vitest'

import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_HINTS,
  REPORT_REASON_LABELS,
  emptyReport,
  hasReportProblems,
  reportProblems,
} from '../report'
import { REPORT_REASONS } from '@/types/api'

/**
 * Two things worth pinning. The vocabulary has to stay level with the enum — a reason the backend
 * adds and this file does not is a radio button with no words on it — and the details cap has to
 * be the server's, since this is the one field somebody is asked to describe something in and a
 * client-side truncation would take the account of it away.
 */

describe('the reason vocabulary', () => {
  it('has wording for every reason the wire carries', () => {
    // The Record types make the compiler enforce this too; the test is what catches the runtime
    // array and the type drifting apart, which the compiler cannot see.
    for (const reason of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[reason]).toBeTruthy()
      expect(REPORT_REASON_HINTS[reason]).toBeTruthy()
    }
  })

  it('carries no wording for a reason that does not exist', () => {
    expect(Object.keys(REPORT_REASON_LABELS).sort()).toEqual([...REPORT_REASONS].sort())
  })

  it('keeps the details cap at 1000, not the 255 used elsewhere', () => {
    expect(REPORT_DETAILS_MAX).toBe(1000)
  })
})

describe('reportProblems', () => {
  it('requires a reason', () => {
    expect(reportProblems(emptyReport()).reason).toBeDefined()
    expect(hasReportProblems(reportProblems(emptyReport()))).toBe(true)
  })

  it('accepts a reason on its own', () => {
    // `details` is optional on the server for every reason, and the form does not invent a
    // requirement where the person has already said which of the five it was.
    expect(hasReportProblems(reportProblems({ reason: 'SPAM', details: '' }))).toBe(false)
  })

  it('asks for the text when the reason is OTHER', () => {
    // Stricter than the server on purpose: "something else" with nothing after it is a queue row
    // nobody can act on.
    expect(reportProblems({ reason: 'OTHER', details: '' }).details).toBeDefined()
    expect(reportProblems({ reason: 'OTHER', details: '   ' }).details).toBeDefined()
    expect(
      hasReportProblems(
        reportProblems({ reason: 'OTHER', details: 'They asked me to pay off-platform.' }),
      ),
    ).toBe(false)
  })

  it('refuses details past the cap', () => {
    const tooLong = 'a'.repeat(REPORT_DETAILS_MAX + 1)
    expect(reportProblems({ reason: 'SCAM', details: tooLong }).details).toBeDefined()
    expect(
      reportProblems({ reason: 'SCAM', details: 'a'.repeat(REPORT_DETAILS_MAX) }).details,
    ).toBeUndefined()
  })
})
