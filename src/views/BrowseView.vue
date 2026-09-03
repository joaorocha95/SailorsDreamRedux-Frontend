<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import type { PageResponse, ProductResponse, SortableProductField } from '@/types/api'

/**
 * The public catalogue. Guest-visible, so it needs no session — which also makes it the first
 * screen worth building: it proves the dev proxy and the HTTP client end to end without auth in
 * the way.
 */

/**
 * What the sort control offers.
 *
 * `field` is typed `SortableProductField`, so this list cannot name a property the server will
 * not sort by — the whitelist in ProductServiceImpl is `id, name, price, pricePerDay` and
 * anything else is a 400, not a silently ignored parameter.
 *
 * Only ascending price orders are offered, which is a deliberate omission rather than an
 * oversight. A rent-only listing has a null `price` and a sale-only listing a null
 * `pricePerDay`, and nothing in the backend pins where those nulls land, so the ordering falls
 * to the database's default: Postgres sorts nulls last ascending and **first** descending. So
 * "price, high to low" would open with every boat that has no sale price at all. Adding those
 * two orders is a one-line backend change (NULLS LAST on the descending case), not a client fix.
 */
const SORT_OPTIONS = [
  { field: 'id', direction: 'desc', label: 'Newest first' },
  { field: 'name', direction: 'asc', label: 'Name, A–Z' },
  { field: 'price', direction: 'asc', label: 'Price, low to high' },
  { field: 'pricePerDay', direction: 'asc', label: 'Day rate, low to high' },
] as const satisfies readonly {
  field: SortableProductField
  direction: 'asc' | 'desc'
  label: string
}[]

const listings = ref<ProductResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const total = ref(0)

const sortIndex = ref(0)
/**
 * Falls back to the first option rather than being indexed directly: `noUncheckedIndexedAccess`
 * is on, and a number index into the list is `T | undefined` as far as the compiler is
 * concerned. The fallback is also the honest answer if the index ever goes out of range.
 */
const sort = computed(() => SORT_OPTIONS[sortIndex.value] ?? SORT_OPTIONS[0])
/** True once anything has been rendered, so a re-sort replaces the grid instead of the page. */
const hasLoaded = ref(false)
/**
 * The entrance stagger is a first-impression device and is spent once. Re-running it on every
 * sort would make each change of order feel slower than the first paint, which is exactly
 * backwards — the later interaction is the one the user is waiting on.
 */
const stagger = ref(true)

/** A re-sort keeps the old results on screen, dimmed, rather than flashing back to a status line. */
const busy = computed(() => state.value === 'loading' && hasLoaded.value)

async function load() {
  if (hasLoaded.value) stagger.value = false
  state.value = 'loading'

  const { field, direction } = sort.value

  try {
    const page = await api.get<PageResponse<ProductResponse>>('/products', {
      query: { page: 0, size: 24, sort: `${field},${direction}` },
    })
    listings.value = page.content
    total.value = page.totalElements
    state.value = 'ready'
    hasLoaded.value = true
  } catch (error) {
    // ApiError already carries the server's `detail`, which is written to be read by a person.
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

onMounted(load)
watch(sortIndex, load)

/**
 * The API has no currency field on a listing — every price is a bare decimal. Euro is assumed
 * here and should become a real decision before this ships: either a currency column on the
 * product, or a documented single-currency platform.
 */
const money = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function priceLabel(listing: ProductResponse): string {
  // Which price applies follows from the listing type. A BOTH listing carries both, and the sale
  // price is the headline.
  //
  // Tested against null rather than for truthiness: these are numbers, so a 0 would read as
  // "no price" and fall through to the dash. The server rejects a non-positive price, so that
  // cannot happen today — but the guard should not be the thing standing between us and it.
  if (listing.price != null) return money.format(listing.price)
  if (listing.pricePerDay != null) return `${money.format(listing.pricePerDay)} / day`
  return '—'
}
</script>

<template>
  <div class="page">
    <header class="hero">
      <h1>Vessels worth the conversation.</h1>
      <p class="measure">
        Listings from private owners. No brokers, no bidding — just a line straight to whoever is
        holding the keys.
      </p>
    </header>

    <!-- Loading: a quiet line rather than a skeleton grid. We don't know the result count yet,
         and a skeleton that guesses wrong is a layout shift with extra steps. Only for the first
         load — a re-sort dims the results already on screen rather than throwing them away. -->
    <p v-if="state === 'loading' && !hasLoaded" class="status" role="status">Loading listings…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <div class="bar">
        <span class="count">{{ total }} {{ total === 1 ? 'listing' : 'listings' }}</span>

        <span class="sort">
          <label for="sort">Sort</label>
          <select id="sort" v-model="sortIndex">
            <option v-for="(option, index) in SORT_OPTIONS" :key="option.label" :value="index">
              {{ option.label }}
            </option>
          </select>
        </span>
      </div>

      <p v-if="listings.length === 0" class="status">
        No listings yet. The first one to be published will appear here.
      </p>

      <ul v-else class="grid" :class="{ stagger, busy }" :aria-busy="busy">
        <li v-for="(listing, index) in listings" :key="listing.id" :style="{ '--i': index }">
          <RouterLink :to="{ name: 'listing', params: { id: listing.id } }" class="card">
            <div class="crop">
              <img
                v-if="listing.primaryImageUrl"
                :src="listing.primaryImageUrl"
                :alt="listing.name"
                loading="lazy"
              />
              <div v-else class="no-photo" aria-hidden="true"></div>
            </div>
            <h2>{{ listing.name }}</h2>
            <div class="meta">
              <span>{{ listing.listingType.replace('_', ' ').toLowerCase() }}</span>
              <span class="price">{{ priceLabel(listing) }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.hero {
  padding: clamp(2.5rem, 7vw, 5rem) 0 clamp(1.5rem, 3vw, 2.5rem);
}
.hero h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-4);
  line-height: 1.02;
  max-width: 15ch;
}
.hero p {
  color: var(--ink-soft);
  margin-top: var(--sp-4);
  font-size: var(--step-0);
  max-width: 42ch;
}

.status {
  color: var(--ink-soft);
  padding: var(--sp-6) 0 var(--sp-8);
}

.error {
  border-left: 2px solid var(--critical);
  background: var(--critical-wash);
  padding: var(--sp-4) var(--sp-5);
  margin: var(--sp-5) 0 var(--sp-8);
  max-width: var(--measure);
  display: grid;
  gap: var(--sp-2);
  justify-items: start;
}
.error strong {
  color: var(--ink);
}
.error p {
  color: var(--ink-soft);
}
.retry {
  margin-top: var(--sp-2);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: var(--step--1);
  cursor: pointer;
}

/* The count and the sort control. A hairline under the row separates the controls from the
   catalogue without drawing a box around either of them. */
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3) var(--sp-5);
  padding-bottom: var(--sp-4);
  border-bottom: 1px solid var(--rule);
  margin-bottom: var(--sp-6);
  font-size: var(--step--1);
  color: var(--ink-soft);
}
.count {
  font-variant-numeric: tabular-nums;
}

.sort {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
}
.sort label {
  color: var(--ink-faint);
}
.sort select {
  font: inherit;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--rule);
  border-radius: 0;
  padding: var(--sp-1) 0;
  cursor: pointer;
  transition:
    border-color var(--d-press) var(--ease-out),
    transform var(--d-press) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .sort select:hover {
    border-color: var(--ink-faint);
  }
}
.sort select:active {
  transform: scale(0.97);
}
.sort select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}

/* Re-sorting dims the results it is about to replace. The grid coming back in a new order is
   what answers the press, so nothing here moves — only opacity, and only enough to read as
   "working" rather than as "gone". */
.grid.busy {
  opacity: 0.45;
  transition: opacity var(--d-pop) var(--ease-out);
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0 0 var(--sp-8);
  display: grid;
  gap: clamp(2rem, 4vw, 3.4rem) clamp(1.6rem, 3vw, 2.6rem);
  grid-template-columns: 1fr;
}
@media (min-width: 720px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* Stagger on entry, capped so a full page doesn't end with a visible wait. Delay is driven by
   --i from the template rather than nth-child, so it survives filtering and re-ordering.
   Class-gated because the entrance runs on the first paint only — see `stagger` in the script. */
.grid.stagger li {
  opacity: 0;
  transform: translateY(10px);
  animation: rise 520ms var(--ease-out) forwards;
  animation-delay: calc(min(var(--i), 8) * 45ms);
}
@keyframes rise {
  to {
    opacity: 1;
    transform: none;
  }
}

.card {
  display: block;
  text-decoration: none;
  color: inherit;
}

.crop {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--wash);
}
.crop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--d-image) var(--ease-out);
}
.no-photo {
  position: absolute;
  inset: 0;
  background: var(--wash);
}

/* Slow and slight, so it reads as the photograph breathing rather than a UI effect. */
@media (hover: hover) and (pointer: fine) {
  .card:hover .crop img {
    transform: scale(1.035);
  }
}

.card h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-2);
  margin: var(--sp-3) 0 var(--sp-1);
  line-height: 1.15;
}

.meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  font-size: var(--step--1);
  color: var(--ink-soft);
}
.meta span:first-child {
  text-transform: capitalize;
}

.price {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .grid.stagger li {
    opacity: 1;
    transform: none;
    animation: none;
  }
  .card:hover .crop img {
    transform: none;
  }
}
</style>
