import { beforeEach, describe, expect, it, vi } from 'vitest'

import { forgetReviews, hasReviewed, rememberReviewed } from '../reviewed'

/**
 * What matters is that this fails in the safe direction. It is a memo of reviews the server has
 * already accepted, so a lost or unreadable one costs nothing but an extra refusal; a *fabricated*
 * one would hide the form from somebody who is entitled to use it.
 */

describe('reviewed', () => {
  beforeEach(() => {
    forgetReviews()
  })

  it('remembers nothing to begin with', () => {
    expect(hasReviewed(1, 2)).toBe(false)
  })

  it('remembers a review in one direction only', () => {
    rememberReviewed(1, 2)
    expect(hasReviewed(1, 2)).toBe(true)
    // The pair is directional on the server too: being reviewed does not spend your own review.
    expect(hasReviewed(2, 1)).toBe(false)
  })

  it('keeps two viewers apart on a shared browser', () => {
    rememberReviewed(1, 2)
    expect(hasReviewed(3, 2)).toBe(false)
  })

  it('is idempotent', () => {
    rememberReviewed(1, 2)
    rememberReviewed(1, 2)
    expect(hasReviewed(1, 2)).toBe(true)
  })

  it('accumulates', () => {
    rememberReviewed(1, 2)
    rememberReviewed(1, 5)
    expect(hasReviewed(1, 2)).toBe(true)
    expect(hasReviewed(1, 5)).toBe(true)
  })

  it('discards a value in the wrong shape rather than trusting it', () => {
    window.localStorage.setItem('sd:reviewed', '["not", "a", "memo"]')
    expect(hasReviewed(1, 2)).toBe(false)
  })

  it('survives unparseable storage', () => {
    window.localStorage.setItem('sd:reviewed', '{oh no')
    expect(hasReviewed(1, 2)).toBe(false)
  })

  it('offers the form when storage throws', () => {
    // A private window raises on access rather than returning null. The honest fallback is to
    // behave as though nothing was remembered.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasReviewed(1, 2)).toBe(false)
    getItem.mockRestore()
  })

  it('does not throw when a write is refused', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => rememberReviewed(1, 2)).not.toThrow()
    setItem.mockRestore()
  })
})
