<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { priceLabel } from '@/lib/money'
import { relativeTime } from '@/lib/chats'
import { useWishlistStore } from '@/stores/wishlist'

/**
 * The saved listings, in the browse card shape.
 *
 * Unpaged, because the endpoint is: a wishlist is bounded by how many listings one person chose
 * to save, not by how many exist, so the whole set comes back at once and there is no pager to
 * build.
 *
 * Two states the server can hand back that browse never does, because nothing prunes a wishlist
 * row when the listing behind it changes:
 *
 *  - **Unpublished.** `active` is not checked on the way in — following a listing that is not
 *    live is legitimate — and a seller can unpublish one afterwards. Marked, not hidden.
 *  - **Withdrawn.** A soft-deleted listing is *not* filtered out of the wishlist, so a card can
 *    point at a boat whose detail page 404s. Nothing on the browse shape says which, so this is
 *    left to the listing page, which already has a "no longer listed" screen for exactly it.
 */

const wishlist = useWishlistStore()

/** Which card is mid-removal, so its own control can go quiet without dimming the whole grid. */
const removing = ref<number | null>(null)

async function remove(productId: number) {
  removing.value = productId
  try {
    await wishlist.unsave(productId)
  } catch {
    // The store restored the row and holds the message; the card simply comes back.
  } finally {
    removing.value = null
  }
}

onMounted(() => wishlist.ensureLoaded())
</script>

<template>
  <div class="page saved">
    <header class="head">
      <p class="eyebrow">Wishlist</p>
      <h1>Saved</h1>
    </header>

    <p v-if="wishlist.status === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="wishlist.status === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ wishlist.errorMessage }}</p>
      <button type="button" class="retry" @click="wishlist.ensureLoaded()">Try again</button>
    </div>

    <template v-else>
      <p v-if="wishlist.items.length === 0" class="empty">
        Nothing saved yet. The star on a listing keeps it here — useful for a boat you want to think
        about, or watch the price of.
      </p>

      <ul v-else class="grid">
        <li v-for="item in wishlist.items" :key="item.product.id" class="cell">
          <RouterLink
            :to="{ name: 'listing', params: { id: String(item.product.id) } }"
            class="card"
          >
            <div class="crop">
              <img
                v-if="item.product.primaryImageUrl"
                :src="item.product.primaryImageUrl"
                :alt="item.product.name"
                loading="lazy"
              />
              <div v-else class="no-photo" aria-hidden="true"></div>
            </div>
            <h2>{{ item.product.name }}</h2>
            <div class="meta">
              <span>{{ item.product.listingType.replace('_', ' ').toLowerCase() }}</span>
              <span class="price">{{ priceLabel(item.product) }}</span>
            </div>
          </RouterLink>

          <p v-if="!item.product.active" class="inactive">Not currently listed</p>
          <!-- Not lowercased: past a week `relativeTime` gives a date, and "saved 1 september
               2026" reads like a typo. The separator carries the sentence instead. -->
          <p class="when">Saved · {{ relativeTime(item.addedAt) }}</p>

          <button
            type="button"
            class="remove"
            :disabled="removing === item.product.id"
            @click="remove(item.product.id)"
          >
            Remove<span class="sr-only"> {{ item.product.name }} from your saved listings</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.saved {
  padding-block: clamp(1.5rem, 4vw, 3rem) var(--sp-8);
}

.head {
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

/* The browse grid, at the same scale. A saved boat should look like the boat it was saved from. */
.grid {
  list-style: none;
  margin: 0;
  padding: 0 0 var(--sp-8);
  display: grid;
  gap: clamp(2rem, 4vw, 3.4rem) clamp(1.6rem, 3vw, 2.6rem);
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}

.cell {
  position: relative;
}

.card {
  display: block;
  text-decoration: none;
  color: inherit;
}
.crop {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--wash);
}
.crop img,
.no-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--d-image) var(--ease-out);
}
/* The photograph breathing, at the slow duration the spec reserves for it. */
@media (hover: hover) and (pointer: fine) {
  .card:hover .crop img {
    transform: scale(1.03);
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
  justify-content: space-between;
  gap: var(--sp-3);
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
}

.inactive {
  margin-top: var(--sp-2);
  font-size: var(--step--1);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--caution);
}

.when {
  margin-top: var(--sp-2);
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.remove {
  margin-top: var(--sp-2);
  background: none;
  border: 0;
  padding: 0;
  font-size: var(--step--1);
  color: var(--ink-faint);
  text-decoration: underline;
  cursor: pointer;
}
.remove:disabled {
  cursor: default;
  transform: none;
}
@media (hover: hover) and (pointer: fine) {
  .remove:hover {
    color: var(--ink);
  }
}
</style>
