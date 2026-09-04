import type { ChatResponse, MessageResponse } from '@/types/api'

/**
 * The rules a negotiation thread carries that its wire type cannot state.
 *
 * Kept out of the components for the same reason the browse filters are: this is the part with
 * decisions in it — who the other party is, how two overlapping fetches of the same conversation
 * reconcile, and how a server timestamp becomes something a person reads.
 */

/**
 * The other party.
 *
 * A thread has exactly two participants and the server enforces it: whoever opened it, and the
 * seller of the listing it is about. `startChat` refuses a self-negotiation, so these two ids
 * are never equal and this can never hand back the viewer.
 */
export function counterpartyId(chat: ChatResponse, viewerId: number): number {
  return chat.initiatorId === viewerId ? chat.sellerId : chat.initiatorId
}

/**
 * Reconcile a freshly fetched slice of a conversation with what is already on screen.
 *
 * Every read path overlaps. The thread view embeds the newest twenty messages, the poll re-reads
 * those same twenty, and paging the history walks over them again — so appending would show the
 * conversation several times over.
 *
 * **Ordered by id, not by timestamp.** `timestamp` is a `@CreationTimestamp` assigned during the
 * insert, so two messages written inside one clock tick carry the same value and sorting on it
 * alone leaves their order undefined — which is exactly why the server's own query breaks the tie
 * on `id`. Ids are handed out in write order, so sorting on the tiebreaker directly agrees with
 * the server in the tied case and in the ordinary case, and needs no second comparison.
 *
 * The incoming copy wins a collision: it is the newer reading, and it is what carries a `read`
 * flag that has since been flipped by `PATCH /chats/{id}/read`.
 */
export function mergeMessages(
  held: readonly MessageResponse[],
  incoming: readonly MessageResponse[],
): MessageResponse[] {
  const byId = new Map<number, MessageResponse>()
  for (const message of held) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * A server timestamp as a `Date`.
 *
 * The API sends `LocalDateTime`, which Jackson writes with **no zone and no offset** —
 * `2026-09-04T14:23:05.412`. JavaScript reads a date-time in that form as local time, so this is
 * only correct while the browser and the server agree on a zone. They frequently will not: a
 * container running UTC and a reader in Lisbon are an hour apart in summer.
 *
 * That is a gap in the contract rather than something a client can fix — the field would have to
 * become an `Instant` or an `OffsetDateTime` on the wire. Until it does, the assumption lives
 * here, in one function, and {@link relativeTime} refuses to render a future so a skew never
 * shows up as "in 2 hours".
 */
export function parseTimestamp(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const dayFormat = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const clockFormat = new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "3 hours ago", for an inbox row.
 *
 * Anything at or ahead of `now` reads as "Just now" rather than as a future: a clock skew between
 * the server and the reader is far likelier than a message from the future, and "in 40 minutes"
 * on a message somebody just sent reads as a bug in the site.
 */
export function relativeTime(value: string, now: number = Date.now()): string {
  const at = parseTimestamp(value)
  if (!at) return ''

  const elapsed = now - at.getTime()
  if (elapsed < MINUTE) return 'Just now'
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return dayFormat.format(at)
}

/** The time under a message. Just the clock — the day is carried by the divider above it. */
export function clockTime(value: string): string {
  const at = parseTimestamp(value)
  return at ? clockFormat.format(at) : ''
}

function keyOf(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`
}

/**
 * Which calendar day a message belongs to, in the reader's zone.
 *
 * A string rather than a Date so consecutive messages can be grouped by comparing two keys, and
 * so the comparison cannot accidentally be one of dates-including-the-time.
 */
export function dayKey(value: string): string {
  const at = parseTimestamp(value)
  return at ? keyOf(at) : ''
}

/** The divider between one day's messages and the next. */
export function dayLabel(value: string, now: number = Date.now()): string {
  const at = parseTimestamp(value)
  if (!at) return ''

  const key = keyOf(at)
  if (key === keyOf(new Date(now))) return 'Today'
  if (key === keyOf(new Date(now - DAY))) return 'Yesterday'

  return dayFormat.format(at)
}

/**
 * The messages a thread renders, each tagged with the divider that should precede it.
 *
 * Computed here rather than in the template so the grouping is testable and the template stays a
 * single pass — the alternative is an index lookup back into the previous item, which is both
 * harder to read and awkward under `noUncheckedIndexedAccess`.
 */
export interface ThreadEntry {
  message: MessageResponse
  /** The day divider to draw above this message, or null when it continues the one above. */
  divider: string | null
  mine: boolean
}

export function threadEntries(
  messages: readonly MessageResponse[],
  viewerId: number,
  now: number = Date.now(),
): ThreadEntry[] {
  let previousDay = ''
  return messages.map((message) => {
    const day = dayKey(message.timestamp)
    const divider = day === previousDay ? null : dayLabel(message.timestamp, now)
    previousDay = day
    return { message, divider, mine: message.authorId === viewerId }
  })
}
