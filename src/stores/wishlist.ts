import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import type { AddToWishlistRequest, ProductResponse, WishlistItemResponse } from '@/types/api'

/**
 * What this user has saved.
 *
 * A store rather than per-component state because the answer is needed in three places at once —
 * every browse card, the listing page, and the saved page itself — and asking once is what keeps
 * a grid of twenty cards from being twenty requests.
 *
 * `GET /wishlist` is **unpaged**, which is what makes this possible: a wishlist is bounded by how
 * many listings one person chose to save, so the whole set arrives in one request. There is no
 * "is this one saved?" endpoint and none is needed.
 *
 * Both writes are idempotent on the server, so a double-click cannot desynchronise anything: a
 * repeat add returns the existing row and a repeat remove is a no-op.
 */
export const useWishlistStore = defineStore('wishlist', () => {
  const items = ref<WishlistItemResponse[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')

  /**
   * Whose list is in `items`.
   *
   * Compared on every `ensureLoaded`, so signing out and back in as somebody else refetches
   * rather than showing the previous person's saved boats. Cheaper and less fragile than having
   * the auth store reach in here to reset it, which would also be a circular import.
   */
  const loadedFor = ref<number | null>(null)

  let inFlight: Promise<void> | null = null

  const savedIds = computed(() => new Set(items.value.map((item) => item.product.id)))
  const count = computed(() => items.value.length)

  function isSaved(productId: number): boolean {
    return savedIds.value.has(productId)
  }

  async function fetchList(userId: number) {
    status.value = 'loading'
    errorMessage.value = ''

    try {
      items.value = await api.get<WishlistItemResponse[]>('/wishlist')
      loadedFor.value = userId
      status.value = 'ready'
    } catch (error) {
      errorMessage.value =
        error instanceof ApiError ? error.message : 'Could not load your saved listings.'
      status.value = 'error'
      // Not marked as loaded, so the next caller retries rather than trusting an empty list —
      // "you have saved nothing" and "we could not ask" must not look the same.
      loadedFor.value = null
    }
  }

  /**
   * Load once per signed-in user. Concurrent callers share the request, the same way the auth
   * store's bootstrap does — a browse grid mounts twenty save buttons in one tick.
   */
  function ensureLoaded(): Promise<void> {
    const auth = useAuthStore()
    const userId = auth.user?.id ?? null

    if (userId === null) {
      items.value = []
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
   * Save, optimistically.
   *
   * A save control has to answer in the frame it was pressed — it is a small, repeated,
   * low-stakes action, and a spinner on it would be more disruptive than the thing it reports. So
   * the listing goes in immediately and comes back out if the server disagrees.
   *
   * The placeholder carries `addedAt` from the local clock, replaced by the server's row on
   * success. Newest first, matching the order the list itself comes back in.
   */
  async function save(product: ProductResponse) {
    if (isSaved(product.id)) return

    const optimistic: WishlistItemResponse = { addedAt: new Date().toISOString(), product }
    items.value = [optimistic, ...items.value]

    try {
      const body: AddToWishlistRequest = { productId: product.id }
      const created = await api.post<WishlistItemResponse>('/wishlist', body)
      items.value = items.value.map((item) => (item.product.id === product.id ? created : item))
    } catch (error) {
      items.value = items.value.filter((item) => item !== optimistic)
      errorMessage.value =
        error instanceof ApiError ? error.message : 'Could not save that listing.'
      throw error
    }
  }

  /** Remove, optimistically, keyed by the product — the client has the listing, not a row id. */
  async function unsave(productId: number) {
    const removed = items.value.filter((item) => item.product.id === productId)
    if (removed.length === 0) return

    items.value = items.value.filter((item) => item.product.id !== productId)

    try {
      await api.delete<void>(`/wishlist/${productId}`)
    } catch (error) {
      // Put it back where it was rather than at the top: the row's own `addedAt` is what the
      // ordering is built on, so re-sorting by it restores the list exactly.
      items.value = [...removed, ...items.value].sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      errorMessage.value =
        error instanceof ApiError ? error.message : 'Could not remove that listing.'
      throw error
    }
  }

  function toggle(product: ProductResponse) {
    return isSaved(product.id) ? unsave(product.id) : save(product)
  }

  return {
    items,
    status,
    errorMessage,
    savedIds,
    count,
    isSaved,
    ensureLoaded,
    save,
    unsave,
    toggle,
  }
})
