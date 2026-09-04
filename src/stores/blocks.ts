import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import type { BlockResponse, CreateBlockRequest } from '@/types/api'

/**
 * Who this user has blocked.
 *
 * Shared for the same reason the wishlist is: the answer is needed in three places — the thread,
 * the listing whose seller might be blocked, and the account page where a block is undone — and
 * `GET /blocks` is unpaged, so one request answers all of them. A block list is bounded by how
 * many people one person has personally chosen to cut off.
 *
 * **Only your own blocks.** There is deliberately no endpoint for who blocked *you*, and there
 * should not be: answering that would tell a harasser exactly what they had been shut out of. So
 * this store can say "you blocked them" and can never say "they blocked you" — the second only
 * surfaces as the 403 on a send.
 */
export const useBlocksStore = defineStore('blocks', () => {
  const blocks = ref<BlockResponse[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')

  /** Whose list this is, so signing in as somebody else refetches rather than inheriting. */
  const loadedFor = ref<number | null>(null)

  let inFlight: Promise<void> | null = null

  const blockedIds = computed(() => new Set(blocks.value.map((block) => block.blockedUserId)))

  function isBlocked(userId: number): boolean {
    return blockedIds.value.has(userId)
  }

  async function fetchList(userId: number) {
    status.value = 'loading'
    errorMessage.value = ''

    try {
      blocks.value = await api.get<BlockResponse[]>('/blocks')
      loadedFor.value = userId
      status.value = 'ready'
    } catch (error) {
      errorMessage.value =
        error instanceof ApiError ? error.message : 'Could not load your blocked list.'
      status.value = 'error'
      // Not marked loaded, so a caller retries rather than trusting an empty list. Here that
      // matters more than on the wishlist: silently showing nobody as blocked would offer a
      // composer to somebody who deliberately closed that conversation.
      loadedFor.value = null
    }
  }

  function ensureLoaded(): Promise<void> {
    const auth = useAuthStore()
    const userId = auth.user?.id ?? null

    if (userId === null) {
      blocks.value = []
      loadedFor.value = null
      status.value = 'idle'
      return Promise.resolve()
    }

    if (loadedFor.value === userId && status.value === 'ready') return Promise.resolve()
    if (inFlight) return inFlight

    inFlight = fetchList(userId).finally(() => {
      inFlight = null
    })
    return inFlight
  }

  /**
   * Block, and wait for it.
   *
   * Not optimistic, unlike saving a listing. Blocking is a deliberate, infrequent act with a real
   * consequence — the conversation leaves both inboxes — and reporting it as done before the
   * server agrees would be the wrong thing to be wrong about. It is idempotent, so a second press
   * costs nothing.
   */
  async function block(userId: number) {
    const body: CreateBlockRequest = { blockedUserId: userId }
    const created = await api.post<BlockResponse>('/blocks', body)
    if (!isBlocked(userId)) blocks.value = [created, ...blocks.value]
  }

  /** Keyed by the person, not the row: whoever wants to undo this has them in front of them. */
  async function unblock(userId: number) {
    await api.delete<void>(`/blocks/${userId}`)
    blocks.value = blocks.value.filter((item) => item.blockedUserId !== userId)
  }

  return {
    blocks,
    status,
    errorMessage,
    blockedIds,
    isBlocked,
    ensureLoaded,
    block,
    unblock,
  }
})
