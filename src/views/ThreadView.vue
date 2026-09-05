<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { clockTime, counterpartyId, mergeMessages, threadEntries } from '@/lib/chats'
import { lookupProduct, lookupUser } from '@/lib/directory'
import { ApiError, api } from '@/lib/http'
import { usePolling } from '@/lib/polling'
import { hasReviewed, rememberReviewed } from '@/lib/reviewed'
import { useRetryAfter } from '@/lib/retry-after'
import SafetyActions from '@/components/SafetyActions.vue'
import { useAuthStore } from '@/stores/auth'
import { useBlocksStore } from '@/stores/blocks'
import type {
  ChatResponse,
  CreateReviewRequest,
  MessageResponse,
  PageResponse,
  ProductResponse,
  ReviewResponse,
  SendMessageRequest,
  UserResponse,
} from '@/types/api'

/**
 * One negotiation.
 *
 * Three things about this thread are decided by the server and have to be designed for rather
 * than coded around:
 *
 *  1. **Opening it does not mark it read.** `PATCH /chats/{id}/read` is a separate verb, so that
 *     a client can show a preview without silently clearing somebody's badge. This view spends it
 *     deliberately — on arrival, and when a reply lands while the tab is actually in front.
 *  2. **A blocked thread still loads.** The block removes it from both inboxes and refuses new
 *     messages, but `GET /chats/{id}` is left alone on purpose: a block silences a conversation,
 *     it does not erase it. So a bookmarked URL has to resolve to something readable and
 *     un-postable, which is what `blockedByMe` and `closed` below are for.
 *  3. **The listing may be gone.** A withdrawn boat 404s while its chats keep working, so the
 *     header is built to survive a missing subject.
 */

const props = defineProps<{ id: string }>()

const auth = useAuthStore()
const blocks = useBlocksStore()
const { secondsLeft, start: startWait } = useRetryAfter()
const { secondsLeft: reviewWait, start: startReviewWait } = useRetryAfter()

/**
 * How many messages `GET /chats/{id}` embeds — the server's `EMBEDDED_MESSAGE_LIMIT`, mirrored
 * here. It is what tells us a full page of embedded messages might have more behind it.
 */
const EMBEDDED_LIMIT = 20

/** The server clamps `?size=` to this. Fewer round trips when somebody asks for the history. */
const HISTORY_PAGE_SIZE = 100

/** A ceiling on the walk below, so a pathological thread cannot spin the browser. */
const MAX_HISTORY_PAGES = 20

const chat = ref<ChatResponse | null>(null)
const messages = ref<MessageResponse[]>([])
const listing = ref<ProductResponse | null>(null)
/** The listing 404d: withdrawn. Its own state, because it is normal rather than a failure. */
const listingWithdrawn = ref(false)
const other = ref<UserResponse | null>(null)

const state = ref<'loading' | 'ready' | 'missing' | 'forbidden' | 'error'>('loading')
const errorMessage = ref('')

const draft = ref('')
const sending = ref(false)
const sendError = ref('')

/**
 * The thread refused a message. A block from the other direction is invisible until then — the
 * API has no way to ask "does this person block me", and adding one would tell a harasser
 * exactly what they blocked out.
 */
const closed = ref('')
/** A 409: the caller's own account is retired, so nothing can be posted until it comes back. */
const retired = ref('')

const historyLoaded = ref(false)
const loadingHistory = ref(false)

/**
 * The review, offered here because this is where its gate is provably satisfied.
 *
 * A review requires that the two people have negotiated, and with no orders on this platform a
 * shared chat is the only evidence of that — so a thread is the one place the form is certain to
 * clear the first hurdle. The second hurdle, one review per direction per pair, cannot be checked
 * at all: there are no read endpoints for reviews. `hasReviewed` is a local memo of writes this
 * browser has already made, not an answer from the server.
 */
const reviewOpen = ref(false)
const rating = ref(0)
const comment = ref('')
const sendingReview = ref(false)
const reviewError = ref('')
const reviewDone = ref(false)
const alreadyReviewed = ref(false)
/**
 * They blocked you — only ever learned from the 403 on a send, since no endpoint reports an
 * inbound block and there should not be one. Kept for the life of the thread so the form is not
 * offered again into the same refusal.
 */
const reviewBlocked = ref(false)

const viewerId = computed(() => auth.user?.id ?? -1)
const otherId = computed(() => (chat.value ? counterpartyId(chat.value, viewerId.value) : -1))

/**
 * You blocked them — known before writing anything, because `GET /blocks` lists your own blocks.
 *
 * Derived from the store rather than fetched here, so blocking from the actions strip below
 * closes the composer in the same tick. The other direction stays invisible until the send's 403;
 * there is no endpoint for who blocked *you*, and there should not be.
 */
const blockedByMe = computed(() => otherId.value > 0 && blocks.isBlocked(otherId.value))
/**
 * Offered unless this browser knows the write would be refused.
 *
 * A block now stops a review in **both** directions, and half of that is knowable in advance:
 * `blockedByMe` comes off the blocks store, so blocking someone from the strip below takes the
 * review button away in the same tick rather than leaving it there to earn a 403. The other half
 * is not knowable and never will be — `reviewBlocked` is what the refusal leaves behind.
 */
const canReview = computed(
  () =>
    !alreadyReviewed.value &&
    !reviewDone.value &&
    !blockedByMe.value &&
    !reviewBlocked.value &&
    otherId.value > 0,
)
const entries = computed(() => threadEntries(messages.value, viewerId.value))
const unread = computed(() => chat.value?.unreadCount ?? 0)

/** Every reason the composer is not available, in the order they take precedence. */
const canPost = computed(() => !blockedByMe.value && !closed.value && !retired.value)
const mightHaveMore = computed(
  () => !historyLoaded.value && messages.value.length >= EMBEDDED_LIMIT,
)

const remaining = computed(() => 255 - draft.value.length)

/**
 * Within a screenful of the bottom.
 *
 * The test is taken *before* new messages are appended: somebody reading back through a
 * negotiation should not be yanked to the end because the other side typed something, but
 * somebody sitting at the bottom expects the new message to be visible without scrolling.
 */
function isNearBottom() {
  const fromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
  return fromBottom < 160
}

function scrollToEnd() {
  // `instant` rather than smooth: arriving at a conversation should not be a journey down it,
  // and on a long thread the animation would be several seconds of scenery.
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
}

/**
 * Who the listing belongs to and what it is called.
 *
 * Both are quiet on failure. This is the header of a page whose subject is the conversation, and
 * a name that could not be resolved is worth less than the thread it would have labelled.
 */
async function loadContext(loaded: ChatResponse) {
  // `otherId` reads off `chat`, which `load` set before calling this — so the computed is already
  // correct and a second local copy of the same derivation would only be somewhere for the two to
  // disagree.
  const them = otherId.value

  alreadyReviewed.value = hasReviewed(viewerId.value, them)

  const [person, product] = await Promise.all([lookupUser(them), lookupProduct(loaded.productId)])
  other.value = person
  listing.value = product
  listingWithdrawn.value = product === null

  // Your own blocks, so the composer can be replaced with an explanation instead of letting
  // somebody write a paragraph into a 403. A failed load leaves the store empty and the composer
  // offered — the send path handles the refusal, and not knowing is a poor reason to tell
  // somebody a conversation is closed when it may not be.
  await blocks.ensureLoaded()
}

/**
 * Mark everything the viewer did not write as read.
 *
 * Only while the tab is in front. The whole reason this is a separate verb from the GET is so a
 * thread can be fetched without the badge being cleared, and clearing it in a background tab
 * would give that away for nothing.
 */
async function markRead() {
  if (document.hidden || unread.value === 0) return

  try {
    const summary = await api.patch<ChatResponse>(`/chats/${props.id}/read`)
    // The summary carries no messages — the caller is acting on the thread, not re-reading it —
    // so the local copies are flipped here rather than being refetched.
    chat.value = summary
    messages.value = messages.value.map((message) =>
      message.authorId === viewerId.value || message.read ? message : { ...message, read: true },
    )
  } catch {
    // A badge that stays lit is a small wrong; an error banner over a conversation is a larger one.
  }
}

async function load() {
  state.value = 'loading'
  historyLoaded.value = false
  closed.value = ''
  retired.value = ''

  try {
    const loaded = await api.get<ChatResponse>(`/chats/${props.id}`)
    chat.value = loaded
    // Populated here and null on an inbox summary — the same "this response does not carry it"
    // distinction the listing gallery makes.
    messages.value = loaded.messages ?? []
    state.value = 'ready'

    void loadContext(loaded)
    await nextTick()
    scrollToEnd()
    void markRead()
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      state.value = 'missing'
      return
    }
    if (error instanceof ApiError && error.isForbidden) {
      state.value = 'forbidden'
      return
    }
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

/**
 * The rest of the conversation.
 *
 * `GET /chats/{id}/messages` pages **oldest first**, so page 0 is the beginning of the thread
 * rather than the part just above what is on screen. Walking it backwards from the last page
 * would be the obvious way to load "earlier" — and it is wrong here, because the total shifts
 * every time somebody writes: one message arriving mid-walk slides every page boundary by one
 * and a message falls through the gap.
 *
 * Reading the whole history forwards has no such seam, and at this scale it is not even
 * expensive: a negotiation is two people writing 255 characters at a time, so a long one is a
 * few hundred rows. {@link mergeMessages} folds it into what is already displayed.
 */
async function loadHistory() {
  if (loadingHistory.value) return
  loadingHistory.value = true

  // Prepending moves everything the reader is looking at down the page. Measured before and
  // after so the view can be put back where it was.
  const heightBefore = document.documentElement.scrollHeight
  const scrollBefore = window.scrollY

  try {
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const result = await api.get<PageResponse<MessageResponse>>(`/chats/${props.id}/messages`, {
        query: { page, size: HISTORY_PAGE_SIZE },
      })
      messages.value = mergeMessages(messages.value, result.content)
      if (result.last) break
    }
    historyLoaded.value = true

    await nextTick()
    window.scrollTo({
      top: scrollBefore + (document.documentElement.scrollHeight - heightBefore),
      behavior: 'instant',
    })
  } catch (error) {
    sendError.value =
      error instanceof ApiError ? error.message : 'Could not load the earlier messages.'
  } finally {
    loadingHistory.value = false
  }
}

async function send() {
  const text = draft.value.trim()
  // `@NotBlank` on the server, so whitespace alone is a 400. Not worth spending a request on.
  if (!text || sending.value || !canPost.value || secondsLeft.value > 0) return

  sending.value = true
  sendError.value = ''

  try {
    const body: SendMessageRequest = { text }
    const posted = await api.post<MessageResponse>(`/chats/${props.id}/messages`, body)
    messages.value = mergeMessages(messages.value, [posted])
    draft.value = ''
    await nextTick()
    scrollToEnd()
  } catch (error) {
    if (!(error instanceof ApiError)) {
      sendError.value = 'The message did not send. Check your connection and try again.'
      return
    }

    // Each of these is a different situation and gets a different answer. `detail` is written by
    // the server for a person to read, so it is shown rather than replaced.
    if (error.isRateLimited) {
      startWait(error.retryAfterSeconds)
      sendError.value = error.message
    } else if (error.isForbidden) {
      // A block, from whichever side placed it. The history stays on screen.
      closed.value = error.message
    } else if (error.isConflict) {
      // 409 is about the author's own account: only the writer's status is checked on a send,
      // deliberately, so the other side going quiet does not seal the thread.
      retired.value = error.message
    } else if (error.isNotFound) {
      state.value = 'missing'
    } else {
      sendError.value = error.message
    }
  } finally {
    sending.value = false
  }
}

/**
 * Leaving the review.
 *
 * Most refusals here are a different situation and the server's `detail` names which — never
 * negotiated, already reviewed, one of the two accounts retired — so that sentence is shown.
 *
 * The 403 is the exception, for the same reason the duplicate report is in `SafetyActions`: it
 * reads "A block stands between users 3 and 7; neither can start or continue a negotiation with
 * the other", which names account ids at a person and describes an act they did not attempt. It
 * is also the one refusal that says something about the composer's future rather than this
 * attempt, so it closes the form instead of annotating it.
 */
async function submitReview() {
  if (rating.value < 1 || sendingReview.value || reviewWait.value > 0) return

  sendingReview.value = true
  reviewError.value = ''

  try {
    const body: CreateReviewRequest = {
      toUserId: otherId.value,
      rating: rating.value,
      // Optional on the server, and an empty string is not the same as leaving it out.
      comment: comment.value.trim() === '' ? undefined : comment.value.trim(),
    }
    await api.post<ReviewResponse>('/reviews', body)
    rememberReviewed(viewerId.value, otherId.value)
    reviewDone.value = true
    reviewOpen.value = false
  } catch (error) {
    if (!(error instanceof ApiError)) {
      reviewError.value = 'The review did not send. Check your connection and try again.'
      return
    }

    startReviewWait(error.retryAfterSeconds)

    if (error.isForbidden) {
      reviewBlocked.value = true
      reviewOpen.value = false
      reviewError.value = ''
      return
    }

    reviewError.value = error.message
  } finally {
    sendingReview.value = false
  }
}

/**
 * Enter sends; Shift+Enter starts a line.
 *
 * The conventional split, and the right way round for a field capped at 255 characters — most
 * messages here are one line, and reaching for a button after each is friction on the most
 * repeated action on the page.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
}

const polling = usePolling(async () => {
  if (state.value !== 'ready') return

  const wasNearBottom = isNearBottom()
  try {
    const fresh = await api.get<ChatResponse>(`/chats/${props.id}`)
    chat.value = fresh
    const before = messages.value.length
    messages.value = mergeMessages(messages.value, fresh.messages ?? [])

    if (messages.value.length > before && wasNearBottom) {
      await nextTick()
      scrollToEnd()
    }
    void markRead()
  } catch {
    // Silent, like the inbox: the conversation on screen is still true as of a moment ago.
  }
})

onMounted(() => {
  load()
  polling.start()
})

// Vue reuses this component when only the parameter changes, so moving between two threads has
// to reload rather than leave the previous conversation on screen.
watch(
  () => props.id,
  () => {
    messages.value = []
    other.value = null
    listing.value = null
    draft.value = ''
    sendError.value = ''
    reviewOpen.value = false
    reviewDone.value = false
    reviewBlocked.value = false
    reviewError.value = ''
    rating.value = 0
    comment.value = ''
    load()
  },
)
</script>

<template>
  <div class="page thread">
    <p v-if="state === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'missing'" class="notice">
      <h1>No such conversation</h1>
      <p>This thread does not exist, or it never did.</p>
      <RouterLink :to="{ name: 'inbox' }" class="back">Back to messages</RouterLink>
    </div>

    <div v-else-if="state === 'forbidden'" class="notice">
      <h1>Not your conversation</h1>
      <p>
        A negotiation has exactly two people in it — whoever opened it, and the owner of the boat it
        is about. This one is neither.
      </p>
      <RouterLink :to="{ name: 'inbox' }" class="back">Back to messages</RouterLink>
    </div>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="head">
        <RouterLink :to="{ name: 'inbox' }" class="up">All messages</RouterLink>

        <h1>{{ other?.name ?? 'A negotiation' }}</h1>

        <p v-if="listingWithdrawn" class="subject gone">
          <span>No longer listed</span>
          The boat this conversation was about has been withdrawn by its owner. Everything said here
          is still here.
        </p>
        <p v-else-if="listing" class="subject">
          About
          <RouterLink :to="{ name: 'listing', params: { id: String(listing.id) } }">
            {{ listing.name }}
          </RouterLink>
        </p>
      </header>

      <!-- Thread-level actions, between the header and the conversation. Out of the reading flow
           and clear of the sticky composer, and where blocking and reporting will join it. -->
      <div class="thread-actions">
        <button
          v-if="canReview && !reviewOpen"
          type="button"
          class="link-btn"
          @click="reviewOpen = true"
        >
          Leave a review
        </button>
        <p v-else-if="reviewDone" class="done" role="status">
          Review left. Thank you — one per person, so this is spent now.
        </p>
        <!-- A block stops a review both ways. Which side placed it is deliberately not said: the
             server does not say, and the person reading this already knows whether it was them.
             Reporting is offered in its place — it is ungated by blocks on purpose, being the
             channel that goes to staff rather than to everyone. -->
        <p
          v-else-if="blockedByMe || reviewBlocked"
          class="done"
          :role="reviewBlocked ? 'status' : undefined"
        >
          A block stands between you, so a review cannot be left either way. If there is conduct
          worth raising, report it below — that goes to staff.
        </p>
        <p v-else-if="alreadyReviewed" class="done">You have already reviewed this person.</p>
      </div>

      <SafetyActions
        v-if="otherId > 0"
        class="safety-strip"
        :user-id="otherId"
        :name="other?.name"
        context="thread"
      />

      <!-- `canReview` as well as `reviewOpen`, so blocking someone from the strip above closes a
           composer that is already open rather than leaving a form on screen underneath a line
           saying it cannot be sent. -->
      <form v-if="reviewOpen && canReview" class="review" @submit.prevent="submitReview">
        <p class="review-lede">
          How was dealing with {{ other?.name ?? 'them' }}? Reviews are one per person, per
          direction, and cannot be edited afterwards.
        </p>

        <fieldset class="stars">
          <legend class="sr-only">Rating, one to five</legend>
          <label v-for="value in [1, 2, 3, 4, 5]" :key="value" class="star">
            <input v-model.number="rating" type="radio" name="rating" :value="value" />
            <span aria-hidden="true">{{ value <= rating ? '★' : '☆' }}</span>
            <span class="sr-only">{{ value }}</span>
          </label>
        </fieldset>

        <label class="sr-only" for="review-comment">Comment</label>
        <textarea
          id="review-comment"
          v-model="comment"
          rows="3"
          maxlength="255"
          placeholder="Anything worth saying (optional)"
          :disabled="sendingReview"
        ></textarea>

        <div class="review-actions">
          <button
            type="submit"
            class="cta"
            :disabled="sendingReview || rating < 1 || reviewWait > 0"
          >
            <template v-if="reviewWait > 0">Wait {{ reviewWait }}s</template>
            <template v-else>{{ sendingReview ? 'Sending…' : 'Leave review' }}</template>
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="sendingReview"
            @click="reviewOpen = false"
          >
            Cancel
          </button>
        </div>

        <p v-if="reviewError" class="send-error" role="alert">{{ reviewError }}</p>
      </form>

      <div v-if="mightHaveMore || historyLoaded" class="earlier">
        <button v-if="mightHaveMore" type="button" :disabled="loadingHistory" @click="loadHistory">
          {{ loadingHistory ? 'Loading…' : 'Load earlier messages' }}
        </button>
        <p v-else-if="historyLoaded" class="start">The beginning of this conversation.</p>
      </div>

      <!-- CSS transitions rather than keyframes, deliberately: messages arrive in bursts, and a
           transition retargets mid-flight where an animation restarts from its first frame. -->
      <TransitionGroup tag="ol" name="msg" class="messages">
        <li v-for="entry in entries" :key="entry.message.id" :class="{ mine: entry.mine }">
          <p v-if="entry.divider" class="divider">
            <span>{{ entry.divider }}</span>
          </p>
          <div class="bubble">
            <!-- Who wrote it is carried visually by which side it sits on and by the fill. Neither
                 survives being read aloud, so the name is stated for anyone not seeing the page. -->
            <p class="sr-only">{{ entry.mine ? 'You' : (other?.name ?? 'The other person') }}</p>
            <p class="text">{{ entry.message.text }}</p>
            <p class="at">{{ clockTime(entry.message.timestamp) }}</p>
          </div>
        </li>
      </TransitionGroup>

      <div class="composer">
        <p v-if="blockedByMe" class="halted">
          You blocked {{ other?.name ?? 'this person' }}. The conversation stays readable, and
          nothing new can be sent in either direction until the block is lifted.
        </p>

        <p v-else-if="closed" class="halted">{{ closed }}</p>

        <p v-else-if="retired" class="halted">
          {{ retired }}
          <RouterLink :to="{ name: 'account' }">Your account</RouterLink>
        </p>

        <form v-else class="write" @submit.prevent="send">
          <label class="sr-only" for="message">Your message</label>
          <textarea
            id="message"
            v-model="draft"
            rows="2"
            maxlength="255"
            placeholder="Write a message"
            :disabled="sending"
            @keydown="onKeydown"
          ></textarea>

          <div class="actions">
            <!-- Only near the cap. A counter that is always on turns every message into an
                 exercise in budgeting; one that appears at 200 is a warning. -->
            <span v-if="remaining <= 55" class="left" :class="{ tight: remaining <= 10 }">
              {{ remaining }}
            </span>

            <button
              type="submit"
              class="cta"
              :disabled="sending || draft.trim().length === 0 || secondsLeft > 0"
            >
              <template v-if="secondsLeft > 0">Wait {{ secondsLeft }}s</template>
              <template v-else>{{ sending ? 'Sending…' : 'Send' }}</template>
            </button>
          </div>
        </form>

        <p v-if="sendError" class="send-error" role="alert">{{ sendError }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.thread {
  padding-block: clamp(1.5rem, 4vw, 3rem) 0;
}

.status {
  color: var(--ink-soft);
  padding: var(--sp-6) 0;
}

.notice,
.error {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  max-width: var(--measure);
  padding: var(--sp-6) 0 var(--sp-8);
}
.notice h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}
.notice p,
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
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: var(--step--1);
  cursor: pointer;
}

.head {
  padding-bottom: var(--sp-5);
  border-bottom: 1px solid var(--rule);
}
.up {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
}
.head h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-2);
  margin: var(--sp-2) 0 var(--sp-2);
}

.subject {
  font-size: var(--step--1);
  color: var(--ink-soft);
  max-width: var(--measure);
}

/* The withdrawn treatment: a caution label above the sentence, not a red banner. Nothing has
   gone wrong — the boat was taken off the market, which sellers are entitled to do. */
.subject.gone span {
  display: block;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--caution);
  margin-bottom: var(--sp-1);
}

.earlier {
  padding: var(--sp-5) 0 0;
  text-align: center;
}
.earlier button {
  background: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.34rem 0.9rem;
  font-size: var(--step--1);
  color: var(--ink-soft);
  cursor: pointer;
}
.start {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.thread-actions {
  display: flex;
  gap: var(--sp-4);
  padding-top: var(--sp-4);
  font-size: var(--step--1);
}

.link-btn {
  background: none;
  border: 0;
  padding: 0;
  font-size: var(--step--1);
  color: var(--ink-soft);
  text-decoration: underline;
  cursor: pointer;
}
.link-btn:disabled {
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}

.done {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.safety-strip {
  padding-top: var(--sp-3);
}

.review {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  margin-top: var(--sp-4);
  padding: var(--sp-4);
  background: var(--wash);
  border-radius: 3px;
  max-width: var(--measure);
}
.review-lede {
  font-size: var(--step--1);
  color: var(--ink-soft);
}
.review textarea {
  width: 100%;
  resize: vertical;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
}

.stars {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  gap: var(--sp-1);
}
.star {
  cursor: pointer;
  font-size: var(--step-2);
  line-height: 1;
  color: var(--ink);
}
/* The input is the control; the star is its face. Hidden rather than removed so the radio group
   keeps its keyboard behaviour and its focus ring lands somewhere visible. */
.star input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.star:has(input:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 2px;
}

.review-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.messages {
  list-style: none;
  margin: 0;
  padding: var(--sp-5) 0 var(--sp-6);
  display: grid;
  gap: var(--sp-3);
}

.messages li {
  display: grid;
  justify-items: start;
}
.messages li.mine {
  justify-items: end;
}

/* A full-width rule with the date sitting in it. Cheaper to read than a floating pill, and it
   doubles as the visual break between one day's exchange and the next. */
.divider {
  width: 100%;
  justify-self: stretch;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: var(--sp-4) 0 var(--sp-3);
  font-size: var(--step--1);
  color: var(--ink-faint);
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--rule-soft);
}

.bubble {
  max-width: min(46ch, 100%);
  padding: var(--sp-3) var(--sp-4);
  border-radius: 3px;
  background: var(--surface);
  border: 1px solid var(--rule);
}
/* Yours is the solid one. Two tinted bubbles would need a legend; ink against paper does not. */
.messages li.mine .bubble {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--ground);
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.at {
  margin-top: var(--sp-1);
  font-family: var(--font-mono);
  font-size: var(--step--1);
  color: var(--ink-faint);
}
.messages li.mine .at {
  color: var(--ink-faint);
  opacity: 0.85;
}

/* Enter from .95 and a few pixels below, never from scale(0). Transform and opacity only. */
.msg-enter-active {
  transition:
    opacity var(--d-overlay) var(--ease-out),
    transform var(--d-overlay) var(--ease-out);
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
/* The list reflows when an older page is prepended; this is what stops that being a jump. */
.msg-move {
  transition: transform var(--d-overlay) var(--ease-in-out);
}

/* Sticky rather than a fixed bar: the composer belongs to the page, and on a short thread it
   should sit under the last message rather than float over empty ground. */
.composer {
  position: sticky;
  bottom: 0;
  padding: var(--sp-4) 0 var(--sp-5);
  background: var(--ground);
  border-top: 1px solid var(--rule);
}

.write {
  display: grid;
  gap: var(--sp-3);
}
.write textarea {
  width: 100%;
  resize: vertical;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  transition: border-color var(--d-pop) var(--ease-out);
}
.write textarea:focus {
  border-color: var(--ink-faint);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-4);
}

.left {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--step--1);
  color: var(--ink-faint);
}
.left.tight {
  color: var(--caution);
}

.cta {
  font-size: var(--step--1);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.5rem 1.2rem;
  cursor: pointer;
}
.cta:disabled {
  background: var(--wash);
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}

/* The un-postable states. Stated in ink on the wash rather than in red: a block is somebody's
   standing decision, not an error the reader should try to correct. */
.halted {
  padding: var(--sp-3) var(--sp-4);
  background: var(--wash);
  border-radius: 3px;
  font-size: var(--step--1);
  color: var(--ink-soft);
  max-width: var(--measure);
}

.send-error {
  margin-top: var(--sp-2);
  font-size: var(--step--1);
  color: var(--critical);
}

.back {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

@media (prefers-reduced-motion: reduce) {
  /* Gentler, not none: the message still announces itself, it just travels less far. */
  .msg-enter-from {
    transform: translateY(2px) scale(1);
  }
}
</style>
