<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { formatDayRate, formatPrice } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import type { ListingType, ProductResponse, UserResponse } from '@/types/api'

/**
 * One listing.
 *
 * Uses the *detail* response shape, where `imageUrls` is the full ordered gallery — `[]` for a
 * listing with no photographs, never null. Browse sends null there to say "this response does
 * not carry the gallery", which is a different statement, and building the gallery from a browse
 * card would quietly show nothing.
 */

const props = defineProps<{ id: string }>()

const route = useRoute()
const auth = useAuthStore()

const listing = ref<ProductResponse | null>(null)
const seller = ref<UserResponse | null>(null)
/** `gone` is its own state: a withdrawn listing is a 404, and that is not a failure to explain. */
const state = ref<'loading' | 'ready' | 'gone' | 'error'>('loading')
const errorMessage = ref('')
const activeImage = ref(0)

const images = computed(() => listing.value?.imageUrls ?? [])
const currentImage = computed(() => images.value[activeImage.value] ?? null)

const isOwnListing = computed(
  () => auth.user !== null && listing.value !== null && auth.user.id === listing.value.sellerId,
)

const TYPE_LABELS: Record<ListingType, string> = {
  FOR_SALE: 'For sale',
  FOR_RENT: 'For rent',
  BOTH: 'For sale or rent',
}

/**
 * The seller's name, and only for a signed-in visitor.
 *
 * `GET /users/{id}` is not on the guest surface — SecurityConfig permits the catalogue and the
 * categories, and everything else falls through to `authenticated()`. So a guest genuinely
 * cannot be told who the owner is, and the page says less rather than showing a failed request.
 *
 * A failure when signed in is quiet for the same reason it is on the category list: this is one
 * line of a page whose subject is the boat.
 */
async function loadSeller(sellerId: number) {
  if (!auth.isAuthenticated) return
  try {
    seller.value = await api.get<UserResponse>(`/users/${sellerId}`)
  } catch {
    seller.value = null
  }
}

async function load() {
  state.value = 'loading'
  seller.value = null
  activeImage.value = 0

  try {
    const found = await api.get<ProductResponse>(`/products/${props.id}`)
    listing.value = found
    state.value = 'ready'
    void loadSeller(found.sellerId)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      state.value = 'gone'
      return
    }
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

onMounted(load)
// Vue reuses the component when only the parameter changes, so the id has to be watched or a
// link from one listing to another would leave the previous boat on screen.
watch(() => props.id, load)
</script>

<template>
  <div class="page detail">
    <p v-if="state === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'gone'" class="gone">
      <h1>No longer listed</h1>
      <p>
        This boat has been withdrawn by its owner. Any conversation you already had about it is
        still in your inbox.
      </p>
      <RouterLink :to="{ name: 'browse' }" class="back">Back to browse</RouterLink>
    </div>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <article v-else-if="listing" class="layout">
      <div class="gallery">
        <div class="frame">
          <!-- Opacity only, and brief: swapping a thumbnail is a repeated action, so the slow
               photographic scale used on the browse cards would read as lag here. -->
          <Transition name="swap" mode="out-in">
            <img
              v-if="currentImage"
              :key="currentImage"
              :src="currentImage"
              :alt="`${listing.name}, photograph ${activeImage + 1} of ${images.length}`"
            />
            <div v-else class="no-photo" aria-hidden="true"></div>
          </Transition>
        </div>

        <ul v-if="images.length > 1" class="thumbs">
          <li v-for="(url, index) in images" :key="url">
            <button
              type="button"
              :class="{ current: index === activeImage }"
              :aria-current="index === activeImage"
              @click="activeImage = index"
            >
              <img :src="url" :alt="`Show photograph ${index + 1}`" loading="lazy" />
            </button>
          </li>
        </ul>
      </div>

      <div class="info">
        <p class="kind">{{ TYPE_LABELS[listing.listingType] }}</p>
        <h1>{{ listing.name }}</h1>

        <p v-if="!listing.active" class="draft">Not published — only you can see this.</p>

        <!-- Both prices, each labelled, rather than one headline figure: on a listing offered
             both ways they are different offers, not two ways of saying the same one. -->
        <dl class="prices">
          <div v-if="listing.price != null">
            <dt>Sale price</dt>
            <dd>{{ formatPrice(listing.price) }}</dd>
          </div>
          <div v-if="listing.pricePerDay != null">
            <dt>Day rate</dt>
            <dd>{{ formatDayRate(listing.pricePerDay) }}</dd>
          </div>
        </dl>

        <p class="description">{{ listing.description }}</p>

        <div class="owner">
          <p v-if="seller" class="who">
            <img v-if="seller.profilePictureUrl" :src="seller.profilePictureUrl" alt="" />
            <span
              >Listed by <strong>{{ seller.name }}</strong></span
            >
          </p>
          <p v-else class="who">Listed by a private owner</p>

          <p v-if="isOwnListing" class="note">This is your listing.</p>

          <RouterLink
            v-else-if="!auth.isAuthenticated"
            class="cta"
            :to="{ name: 'login', query: { redirect: route.fullPath } }"
          >
            Sign in to message the owner
          </RouterLink>

          <template v-else>
            <button type="button" class="cta" disabled>Message the owner</button>
            <p class="note">Messaging opens with the inbox.</p>
          </template>
        </div>

        <RouterLink :to="{ name: 'browse' }" class="back">Back to browse</RouterLink>
      </div>
    </article>
  </div>
</template>

<style scoped>
/* padding-block, not the shorthand: this element is also `.page`, which supplies the horizontal
   gutter, and a shorthand here would reset it to zero and let the gallery bleed off the edge. */
.detail {
  padding-block: clamp(1.5rem, 4vw, 3rem) var(--sp-8);
}

.status {
  color: var(--ink-soft);
  padding: var(--sp-6) 0;
}

.gone,
.error {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  max-width: var(--measure);
  padding: var(--sp-6) 0 var(--sp-8);
}
.gone h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}
.gone p,
.error p {
  color: var(--ink-soft);
}
.error {
  border-left: 2px solid var(--critical);
  background: var(--critical-wash);
  padding: var(--sp-4) var(--sp-5);
}
.error strong {
  color: var(--ink);
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

/* Photography first: the gallery takes the larger column, and the text sits beside it rather
   than under a banner. Single column below the breakpoint, image first. */
.layout {
  display: grid;
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}
@media (min-width: 860px) {
  .layout {
    grid-template-columns: 1.35fr 1fr;
  }
}

.frame {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--wash);
}
.frame img,
.no-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.swap-enter-active,
.swap-leave-active {
  transition: opacity var(--d-pop) var(--ease-out);
}
.swap-enter-from,
.swap-leave-to {
  opacity: 0;
}

.thumbs {
  list-style: none;
  margin: var(--sp-3) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.thumbs button {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  width: 72px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  opacity: 0.55;
  transition: opacity var(--d-press) var(--ease-out);
}
.thumbs button.current {
  opacity: 1;
}
.thumbs button:active {
  transform: scale(0.97);
}
.thumbs button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .thumbs button:hover {
    opacity: 1;
  }
}
.thumbs img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.kind {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.info h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
  line-height: 1.05;
  margin: var(--sp-2) 0 var(--sp-4);
}

.draft {
  font-size: var(--step--1);
  color: var(--caution);
  margin-bottom: var(--sp-4);
}

.prices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
  margin: 0 0 var(--sp-5);
  padding-bottom: var(--sp-5);
  border-bottom: 1px solid var(--rule);
}
.prices dt {
  font-size: var(--step--1);
  color: var(--ink-faint);
}
.prices dd {
  margin: var(--sp-1) 0 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--step-1);
  color: var(--ink);
}

.description {
  color: var(--ink-soft);
  max-width: var(--measure);
  white-space: pre-line;
}

.owner {
  margin-top: var(--sp-6);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--rule);
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
}
.who {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--step--1);
  color: var(--ink-soft);
}
.who strong {
  color: var(--ink);
  font-weight: 500;
}
.who img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.cta {
  font: inherit;
  font-size: var(--step--1);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.55rem 1.1rem;
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--d-press) var(--ease-out);
}
.cta:active:not(:disabled) {
  transform: scale(0.97);
}
.cta:disabled {
  background: var(--wash);
  color: var(--ink-faint);
  cursor: default;
}
.cta:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}

.note {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.back {
  margin-top: var(--sp-6);
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

@media (prefers-reduced-motion: reduce) {
  .swap-enter-active,
  .swap-leave-active {
    transition-duration: 80ms;
  }
}
</style>
