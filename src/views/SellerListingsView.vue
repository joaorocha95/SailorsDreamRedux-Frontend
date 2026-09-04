<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { formatDayRate, formatPrice } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import type { ListingType, PageResponse, ProductResponse } from '@/types/api'

/**
 * Everything this seller has listed, published or not.
 *
 * `includeInactive=true` drops the active filter rather than inverting it, so one page carries
 * drafts and published listings together — which is the right shape anyway: a draft is a listing
 * that has not been published yet, not a different kind of object, and splitting them would make
 * the seller check two places for the boat they were just editing.
 *
 * The parameter is also access-controlled in a way worth stating: `includeInactive=true` demands
 * a `sellerId`, and that id must be **your own**. Anything else is a 403, so this request always
 * carries both and there is no version of this page that shows somebody else's drafts.
 */

const PAGE_SIZE = 12

const auth = useAuthStore()

const listings = ref<ProductResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

const page = ref(0)
const totalPages = ref(0)
const isFirstPage = ref(true)
const isLastPage = ref(true)
const hasLoaded = ref(false)

/** Which row is mid-confirmation. Withdrawal cannot be undone, so it takes two deliberate acts. */
const confirmingWithdraw = ref<number | null>(null)
const workingOn = ref<number | null>(null)
const rowError = ref('')

const busy = computed(() => state.value === 'loading' && hasLoaded.value)

const TYPE_LABELS: Record<ListingType, string> = {
  FOR_SALE: 'For sale',
  FOR_RENT: 'For rent',
  BOTH: 'For sale or rent',
}

async function load() {
  if (!auth.user) return
  state.value = 'loading'
  rowError.value = ''

  try {
    const result = await api.get<PageResponse<ProductResponse>>('/products', {
      query: {
        sellerId: auth.user.id,
        includeInactive: true,
        page: page.value,
        size: PAGE_SIZE,
        // Newest first. `id` is one of the four properties the server will sort by; anything
        // else is a 400.
        sort: 'id,desc',
      },
    })
    listings.value = result.content
    totalPages.value = result.totalPages
    isFirstPage.value = result.first
    isLastPage.value = result.last
    state.value = 'ready'
    hasLoaded.value = true
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

function goToPage(next: number) {
  page.value = next
  load()
  window.scrollTo(0, 0)
}

/**
 * Publishing. New listings are created inactive and stay invisible until this is spent.
 *
 * The response is the updated listing, so the row is replaced in place rather than the whole page
 * being refetched — the seller is looking at the badge that is about to change.
 */
async function publish(listing: ProductResponse) {
  workingOn.value = listing.id
  rowError.value = ''

  try {
    const updated = await api.patch<ProductResponse>(`/products/${listing.id}/activate`)
    listings.value = listings.value.map((item) => (item.id === updated.id ? updated : item))
  } catch (error) {
    rowError.value =
      error instanceof ApiError ? error.message : 'Could not publish that listing just now.'
  } finally {
    workingOn.value = null
  }
}

/**
 * Withdrawing, which is permanent.
 *
 * The server soft-deletes: the row survives so that negotiations about the boat stay readable,
 * but every read path filters it out and **there is no endpoint that brings it back**. So this is
 * stated as irreversible rather than dressed up as unpublishing, and it takes a second press.
 */
async function withdraw(listing: ProductResponse) {
  workingOn.value = listing.id
  rowError.value = ''

  try {
    await api.delete<void>(`/products/${listing.id}`)
    listings.value = listings.value.filter((item) => item.id !== listing.id)
    confirmingWithdraw.value = null
    // The page may now be short, or empty and not the first. Refetching keeps the pager honest.
    if (listings.value.length === 0 && page.value > 0) page.value -= 1
    load()
  } catch (error) {
    rowError.value =
      error instanceof ApiError ? error.message : 'Could not withdraw that listing just now.'
  } finally {
    workingOn.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page selling">
    <header class="head">
      <div>
        <p class="eyebrow">Selling</p>
        <h1>Your listings</h1>
      </div>
      <RouterLink :to="{ name: 'listing-new' }" class="cta">List a boat</RouterLink>
    </header>

    <p v-if="state === 'loading' && !hasLoaded" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <p v-if="listings.length === 0" class="empty">
        Nothing listed yet. A listing starts as a draft — you write it, add photographs, and publish
        it when it is ready.
      </p>

      <p v-if="rowError" class="row-error" role="alert">{{ rowError }}</p>

      <ul v-if="listings.length" class="rows" :class="{ busy }">
        <li v-for="listing in listings" :key="listing.id">
          <div class="thumb">
            <img v-if="listing.primaryImageUrl" :src="listing.primaryImageUrl" alt="" />
            <div v-else class="no-photo" aria-hidden="true"></div>
          </div>

          <div class="what">
            <p class="kind">
              {{ TYPE_LABELS[listing.listingType] }}
              <span v-if="!listing.active" class="draft">Draft</span>
            </p>
            <h2>{{ listing.name }}</h2>
            <p class="prices">
              <span v-if="listing.price != null">{{ formatPrice(listing.price) }}</span>
              <span v-if="listing.pricePerDay != null">{{
                formatDayRate(listing.pricePerDay)
              }}</span>
            </p>
          </div>

          <div class="actions">
            <RouterLink :to="{ name: 'listing-edit', params: { id: String(listing.id) } }">
              Edit
            </RouterLink>

            <button
              v-if="!listing.active"
              type="button"
              class="publish"
              :disabled="workingOn === listing.id"
              @click="publish(listing)"
            >
              Publish
            </button>
            <RouterLink
              v-else
              :to="{ name: 'listing', params: { id: String(listing.id) } }"
              class="view"
            >
              View
            </RouterLink>

            <!-- Two presses, and the second one says what it does. There is no way back from
                 this: the server keeps the row so past negotiations stay readable, but nothing
                 in the API can make the listing visible again. -->
            <template v-if="confirmingWithdraw === listing.id">
              <button
                type="button"
                class="danger"
                :disabled="workingOn === listing.id"
                @click="withdraw(listing)"
              >
                Withdraw permanently
              </button>
              <button type="button" class="cancel" @click="confirmingWithdraw = null">
                Keep it
              </button>
            </template>
            <button
              v-else
              type="button"
              class="quiet-danger"
              @click="confirmingWithdraw = listing.id"
            >
              Withdraw
            </button>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="pages" aria-label="Pagination">
        <button type="button" :disabled="isFirstPage || busy" @click="goToPage(page - 1)">
          Previous
        </button>
        <span class="of">Page {{ page + 1 }} of {{ totalPages }}</span>
        <button type="button" :disabled="isLastPage || busy" @click="goToPage(page + 1)">
          Next
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.selling {
  padding-block: clamp(1.5rem, 4vw, 3rem) var(--sp-8);
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
  margin-bottom: var(--sp-6);
}
.eyebrow {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.head h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
  margin-top: var(--sp-2);
}

.cta {
  font-size: var(--step--1);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.55rem 1.1rem;
  text-decoration: none;
  white-space: nowrap;
}

.status,
.empty {
  color: var(--ink-soft);
  max-width: var(--measure);
  padding: var(--sp-6) 0;
}

.error {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  max-width: var(--measure);
  border-left: 2px solid var(--critical);
  background: var(--critical-wash);
  padding: var(--sp-4) var(--sp-5);
}
.error p {
  color: var(--ink-soft);
}
.error strong {
  color: var(--ink);
}
.retry {
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: var(--step--1);
  cursor: pointer;
}

.row-error {
  margin-bottom: var(--sp-4);
  font-size: var(--step--1);
  color: var(--critical);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--rule);
  transition: opacity var(--d-pop) var(--ease-out);
}
.rows.busy {
  opacity: 0.55;
}

.rows li {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-5);
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--rule-soft);
}

.thumb {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--wash);
}
.thumb img,
.no-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kind {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* Caution, not critical: an unpublished listing is a normal stage of writing one, not a fault. */
.draft {
  letter-spacing: 0.08em;
  color: var(--caution);
  border: 1px solid currentcolor;
  border-radius: 999px;
  padding: 0 0.5rem;
}

.what h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-2);
  margin: var(--sp-1) 0;
}

.prices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  font-size: var(--step--1);
}
.actions a,
.actions button {
  font-size: var(--step--1);
  white-space: nowrap;
}
.actions a {
  color: var(--ink-soft);
}

.publish {
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.34rem 0.9rem;
  cursor: pointer;
}
.publish:disabled {
  background: var(--wash);
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}

.quiet-danger,
.cancel {
  background: none;
  border: 0;
  padding: 0;
  color: var(--ink-faint);
  text-decoration: underline;
  cursor: pointer;
}

/* Only the confirming press is coloured. Offering the first one in red would read as a warning
   about a button that so far does nothing but ask a question. */
.danger {
  background: none;
  border: 1px solid var(--critical);
  border-radius: 3px;
  padding: 0.34rem 0.9rem;
  color: var(--critical);
  cursor: pointer;
}

.pages {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-top: var(--sp-6);
}
.pages button {
  background: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.34rem 0.9rem;
  font-size: var(--step--1);
  color: var(--ink-soft);
  cursor: pointer;
}
.pages button:disabled {
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}
.of {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

@media (max-width: 720px) {
  .rows li {
    grid-template-columns: 84px minmax(0, 1fr);
  }
  .actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
}
</style>
