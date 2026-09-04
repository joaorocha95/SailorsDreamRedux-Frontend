/**
 * Who this browser has already reviewed.
 *
 * A local memo, and **not a source of truth**. The server owns the rule — one review per
 * direction per pair — and enforces it on every write. This exists only because there is no way
 * to *ask*: the reviews API is a single `POST /reviews` with no read endpoints at all, so a
 * client cannot find out whether it has already reviewed somebody except by trying and being
 * refused.
 *
 * The roadmap asks for the form to be offered only where it will succeed. Half of that gate is
 * knowable — a shared chat is what qualifies two people to review each other, and a thread *is*
 * that evidence — and this closes most of the other half. It is wrong in exactly one direction,
 * which is the harmless one: a review written on another device is not remembered here, the form
 * is offered again, and the 400 explains it. It never claims a review exists that does not,
 * because nothing is written here until one has been accepted.
 *
 * Keyed by viewer, so two people sharing a browser do not inherit each other's memo.
 */

const STORAGE_KEY = 'sd:reviewed'

type Memo = Record<string, number[]>

/**
 * Storage can throw, not just come back empty — a private window, or a browser set to block site
 * data, raises on access rather than returning null. A memo that cannot be read simply means the
 * form is offered, which is the behaviour without this file at all.
 */
function read(): Memo {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // Anything that is not the shape written below — a older format, or something else using the
    // key — is discarded rather than trusted into a type assertion.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Memo
  } catch {
    return {}
  }
}

function write(memo: Memo) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memo))
  } catch {
    // Full, or blocked. The review still happened; only the memo of it is lost.
  }
}

export function hasReviewed(viewerId: number, toUserId: number): boolean {
  const entry = read()[String(viewerId)]
  return Array.isArray(entry) && entry.includes(toUserId)
}

/** Called after a review is actually accepted, never before. */
export function rememberReviewed(viewerId: number, toUserId: number) {
  const memo = read()
  const key = String(viewerId)
  const entry = memo[key]
  const existing = Array.isArray(entry) ? entry : []
  if (existing.includes(toUserId)) return

  memo[key] = [...existing, toUserId]
  write(memo)
}

/** For tests, and for anywhere a stale memo should stop being consulted. */
export function forgetReviews() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do */
  }
}
