import { describe, expect, it } from 'vitest'

import {
  clockTime,
  counterpartyId,
  dayKey,
  dayLabel,
  mergeMessages,
  parseTimestamp,
  relativeTime,
  threadEntries,
} from '../chats'
import type { ChatResponse, MessageResponse } from '@/types/api'

/**
 * The two things worth pinning down here are the ones that go wrong silently.
 *
 * Merging is one: every read path over a conversation overlaps the others, so an implementation
 * that appends looks correct on a first load and shows the last twenty messages twice on the
 * first poll. The other is the future: `LocalDateTime` arrives with no offset, so a server in a
 * different zone reads as a message sent hours from now, and "in 3 hours" on something that has
 * just been said reads as a broken site rather than as a misconfigured clock.
 */

function message(id: number, overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id,
    authorId: 1,
    text: `message ${id}`,
    read: false,
    timestamp: '2026-09-04T10:00:00',
    ...overrides,
  }
}

function chat(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    id: 7,
    productId: 12,
    initiatorId: 1,
    sellerId: 2,
    createdAt: '2026-09-01T09:00:00',
    lastMessageAt: '2026-09-04T10:00:00',
    unreadCount: 0,
    messages: null,
    ...overrides,
  }
}

describe('counterpartyId', () => {
  it('gives the seller to the initiator', () => {
    expect(counterpartyId(chat(), 1)).toBe(2)
  })

  it('gives the initiator to the seller', () => {
    expect(counterpartyId(chat(), 2)).toBe(1)
  })
})

describe('mergeMessages', () => {
  it('does not repeat what is already held', () => {
    const held = [message(1), message(2)]
    expect(mergeMessages(held, [message(2), message(3)]).map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('prefers the incoming copy, so a read flag can be flipped', () => {
    const merged = mergeMessages([message(1)], [message(1, { read: true })])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.read).toBe(true)
  })

  it('orders by id, not by arrival', () => {
    // The history pages oldest-first and the thread view embeds the newest twenty, so the two
    // fetches reach this function in opposite directions.
    const merged = mergeMessages([message(40), message(41)], [message(1), message(2)])
    expect(merged.map((m) => m.id)).toEqual([1, 2, 40, 41])
  })

  it('keeps a tie in send order when two messages share a timestamp', () => {
    // A @CreationTimestamp assigned inside one clock tick gives both messages the same value.
    // Ids are handed out in write order, which is the tiebreaker the server itself uses.
    const same = '2026-09-04T10:00:00'
    const merged = mergeMessages(
      [],
      [message(9, { timestamp: same }), message(8, { timestamp: same })],
    )
    expect(merged.map((m) => m.id)).toEqual([8, 9])
  })

  it('handles an empty side', () => {
    expect(mergeMessages([], [])).toEqual([])
    expect(mergeMessages([message(1)], []).map((m) => m.id)).toEqual([1])
  })
})

describe('parseTimestamp', () => {
  it('reads a zoneless LocalDateTime', () => {
    const at = parseTimestamp('2026-09-04T14:23:05.412')
    expect(at?.getFullYear()).toBe(2026)
    expect(at?.getHours()).toBe(14)
  })

  it('answers null rather than an Invalid Date', () => {
    expect(parseTimestamp('not a date')).toBeNull()
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-04T12:00:00').getTime()

  it('says Just now inside the first minute', () => {
    expect(relativeTime('2026-09-04T11:59:30', now)).toBe('Just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime('2026-09-04T11:55:00', now)).toBe('5 minutes ago')
    expect(relativeTime('2026-09-04T09:00:00', now)).toBe('3 hours ago')
    expect(relativeTime('2026-09-02T12:00:00', now)).toBe('2 days ago')
  })

  it('does not pluralise a single unit', () => {
    expect(relativeTime('2026-09-04T11:59:00', now)).toBe('1 minute ago')
    expect(relativeTime('2026-09-04T11:00:00', now)).toBe('1 hour ago')
    expect(relativeTime('2026-09-03T12:00:00', now)).toBe('1 day ago')
  })

  it('falls back to a date past a week', () => {
    expect(relativeTime('2026-08-01T12:00:00', now)).toMatch(/2026/)
  })

  /**
   * The clock-skew guard. The server sends no offset, so a container running UTC and a reader an
   * hour ahead of it puts every fresh message in the future.
   */
  it('never reads as the future', () => {
    expect(relativeTime('2026-09-04T14:00:00', now)).toBe('Just now')
  })

  it('is empty for an unparseable value rather than NaN', () => {
    expect(relativeTime('', now)).toBe('')
  })
})

describe('dayKey and dayLabel', () => {
  const now = new Date('2026-09-04T12:00:00').getTime()

  it('groups a day regardless of the time within it', () => {
    expect(dayKey('2026-09-04T00:01:00')).toBe(dayKey('2026-09-04T23:59:00'))
    expect(dayKey('2026-09-04T12:00:00')).not.toBe(dayKey('2026-09-05T12:00:00'))
  })

  it('names today and yesterday', () => {
    expect(dayLabel('2026-09-04T08:00:00', now)).toBe('Today')
    expect(dayLabel('2026-09-03T23:00:00', now)).toBe('Yesterday')
  })

  it('dates anything older', () => {
    expect(dayLabel('2026-08-30T09:00:00', now)).toMatch(/2026/)
  })
})

describe('clockTime', () => {
  it('is the time alone — the day is on the divider above', () => {
    expect(clockTime('2026-09-04T14:23:05')).toMatch(/23/)
  })
})

describe('threadEntries', () => {
  const now = new Date('2026-09-04T12:00:00').getTime()

  it('marks a divider only on the first message of each day', () => {
    const entries = threadEntries(
      [
        message(1, { timestamp: '2026-09-03T09:00:00' }),
        message(2, { timestamp: '2026-09-03T09:05:00' }),
        message(3, { timestamp: '2026-09-04T08:00:00' }),
      ],
      1,
      now,
    )

    expect(entries.map((e) => e.divider)).toEqual(['Yesterday', null, 'Today'])
  })

  it('separates the viewer from the other party', () => {
    const entries = threadEntries(
      [message(1, { authorId: 1 }), message(2, { authorId: 2 })],
      1,
      now,
    )
    expect(entries.map((e) => e.mine)).toEqual([true, false])
  })
})
