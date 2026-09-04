<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { formatDayRate, formatPrice } from '@/lib/money'
import { useRetryAfter } from '@/lib/retry-after'
import { useAuthStore } from '@/stores/auth'
import type {
  ChatResponse,
  ListingType,
  ProductResponse,
  StartChatRequest,
  UserResponse,
} from '@/types/api'

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
const router = useRouter()
const auth = useAuthStore()
const { secondsLeft, start: startWait } = useRetryAfter()

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

/**
 * Opening a negotiation.
 *
 * `POST /chats` requires a first message — an empty thread is noise in a seller's inbox, and
 * saying something is the whole point of starting one — so the CTA reveals a composer rather
 * than navigating to an empty thread. That also keeps the reader beside the boat while they
 * write about it, which is the sentence they are most likely to want.
 *
 * The call is idempotent: messaging a seller about a listing you have already messaged them
 * about appends to the existing thread and still answers 201. So this is also the way *back*
 * into a conversation from the listing, and it must not read as an error when it lands in one
 * that was already there.
 */
const composing = ref(false)
const firstMessage = ref('')
const starting = ref(false)
const startError = ref('')

const messageRef = ref<HTMLTextAreaElement | null>(null)

async function openComposer() {
  composing.value = true
  startError.value = ''
  await nextTick()
  messageRef.value?.focus()
}

async function startChat() {
  const text = firstMessage.value.trim()
  if (!text || starting.value || !listing.value || secondsLeft.value > 0) return

  starting.value = true
  startError.value = ''

  try {
    const body: StartChatRequest = { productId: listing.value.id, firstMessage: text }
    const chat = await api.post<ChatResponse>('/chats', body)
    router.push({ name: 'thread', params: { id: String(chat.id) } })
  } catch (error) {
    if (!(error instanceof ApiError)) {
      startError.value = 'The message did not send. Check your connection and try again.'
      return
    }

    // The quota here is 20 new threads an hour, keyed to the account. Counting down beats
    // leaving a live button that spends a refusal on every press.
    if (error.isRateLimited) startWait(error.retryAfterSeconds)
    // A withdrawn listing is a 404 on the way in, and the page should say so rather than leaving
    // a composer open over a boat that is no longer for sale.
    if (error.isNotFound) {
      state.value = 'gone'
      return
    }
    // Everything else — a block (403), a retired account on either side (409), a message the
    // server would not accept (400) — arrives with a `detail` written to be read.
    startError.value = error.message
  } finally {
    starting.value = false
  }
}

async function load() {
  state.value = 'loading'
  composing.value = false
  firstMessage.value = ''
  startError.value = ''
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

          <template v-if="isOwnListing">
            <RouterLink
              class="cta"
              :to="{ name: 'listing-edit', params: { id: String(listing.id) } }"
            >
              Edit this listing
            </RouterLink>
            <p class="note">This is your listing, so there is nobody here to message.</p>
          </template>

          <RouterLink
            v-else-if="!auth.isAuthenticated"
            class="cta"
            :to="{ name: 'login', query: { redirect: route.fullPath } }"
          >
            Sign in to message the owner
          </RouterLink>

          <template v-else>
            <button v-if="!composing" type="button" class="cta" @click="openComposer">
              Message the owner
            </button>

            <form v-else class="start" @submit.prevent="startChat">
              <label class="sr-only" for="first-message">Your message</label>
              <textarea
                id="first-message"
                ref="messageRef"
                v-model="firstMessage"
                rows="3"
                maxlength="255"
                placeholder="Ask about the boat, or make an offer"
                :disabled="starting"
              ></textarea>

              <div class="start-actions">
                <button
                  type="submit"
                  class="cta"
                  :disabled="starting || firstMessage.trim().length === 0 || secondsLeft > 0"
                >
                  <template v-if="secondsLeft > 0">Wait {{ secondsLeft }}s</template>
                  <template v-else>{{ starting ? 'Sending…' : 'Send' }}</template>
                </button>
                <button
                  type="button"
                  class="cancel"
                  :disabled="starting"
                  @click="composing = false"
                >
                  Cancel
                </button>
              </div>

              <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>
            </form>
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

/* Full width of the info column: this is the first thing said to a stranger about a boat that
   may cost six figures, and a one-line field invites a one-line message. */
.start {
  display: grid;
  gap: var(--sp-3);
  width: 100%;
  max-width: var(--measure);
}
.start textarea {
  width: 100%;
  resize: vertical;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  transition: border-color var(--d-pop) var(--ease-out);
}
.start textarea:focus {
  border-color: var(--ink-faint);
}

.start-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.cancel {
  background: none;
  border: 0;
  padding: 0;
  font-size: var(--step--1);
  color: var(--ink-soft);
  text-decoration: underline;
  cursor: pointer;
}

.start-error {
  font-size: var(--step--1);
  color: var(--critical);
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
