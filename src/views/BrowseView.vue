<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import type { PageResponse, ProductResponse } from '@/types/api'

/**
 * The public catalogue. Guest-visible, so it needs no session — which also makes it the first
 * screen worth building: it proves the dev proxy and the HTTP client end to end without auth in
 * the way.
 */

const listings = ref<ProductResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const total = ref(0)

async function load() {
  state.value = 'loading'
  try {
    const page = await api.get<PageResponse<ProductResponse>>('/products', {
      query: { page: 0, size: 24, sort: 'id,desc' },
    })
    listings.value = page.content
    total.value = page.totalElements
    state.value = 'ready'
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
  if (listing.price) return money.format(Number(listing.price))
  if (listing.pricePerDay) return `${money.format(Number(listing.pricePerDay))} / day`
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
         and a skeleton that guesses wrong is a layout shift with extra steps. -->
    <p v-if="state === 'loading'" class="status" role="status">Loading listings…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <p v-else-if="listings.length === 0" class="status">
      No listings yet. The first one to be published will appear here.
    </p>

    <ul v-else class="grid">
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
   --i from the template rather than nth-child, so it survives filtering and re-ordering. */
.grid li {
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
  .grid li {
    opacity: 1;
    transform: none;
    animation: none;
  }
  .card:hover .crop img {
    transform: none;
  }
}
</style>
