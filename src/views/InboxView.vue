<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { counterpartyId, relativeTime } from '@/lib/chats'
import { lookupProduct, lookupUser } from '@/lib/directory'
import { ApiError, api } from '@/lib/http'
import { usePolling } from '@/lib/polling'
import { useAuthStore } from '@/stores/auth'
import type { ChatResponse, PageResponse } from '@/types/api'

/**
 * The inbox — every negotiation this user is part of, on either side of it.
 *
 * Ordered by activity, and not sortable: the server ignores `?sort=` here on purpose, because an
 * inbox has exactly one useful order and offering a control that does nothing is worse than
 * offering none. Threads a block covers are simply absent, from both sides — that is the block
 * doing its job, and it is why the thread route needs a state for a URL that still resolves.
 */

/** The server's own default. Asking for more would just be a longer page to scan. */
const PAGE_SIZE = 20

const auth = useAuthStore()

const threads = ref<ChatResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

const page = ref(0)
const totalPages = ref(0)
const isFirstPage = ref(true)
const isLastPage = ref(true)
const hasLoaded = ref(false)

/**
 * Names, filled in after the rows are already on screen.
 *
 * The chat carries ids only, so a row needs two more requests to say anything a person
 * recognises. Waiting on those before drawing anything would make an inbox that is already on
 * the client feel like it is still loading, so the rows render with what they have — the time
 * and the unread count, which are the two things being scanned for — and the names arrive into
 * them. The lookups memoise, so a re-poll costs no requests at all.
 *
 * Two maps rather than one keyed by id: a user and a listing can perfectly well share the number
 * 12 — they are separate sequences — and a single map would let one row's boat overwrite another
 * row's correspondent.
 */
const people = ref<Record<number, string>>({})
const boats = ref<Record<number, string>>({})
/** A listing id that resolved to a 404. Withdrawn, and the row says so rather than staying blank. */
const withdrawn = ref<Record<number, boolean>>({})

/** A refresh keeps the current list on screen rather than replacing it with a status line. */
const busy = computed(() => state.value === 'loading' && hasLoaded.value)

const viewerId = computed(() => auth.user?.id ?? -1)

async function resolveNames(rows: readonly ChatResponse[]) {
  const userIds = new Set<number>()
  const productIds = new Set<number>()

  for (const chat of rows) {
    userIds.add(counterpartyId(chat, viewerId.value))
    productIds.add(chat.productId)
  }

  await Promise.all([
    ...[...userIds].map(async (id) => {
      const user = await lookupUser(id)
      if (user) people.value[id] = user.name
    }),
    ...[...productIds].map(async (id) => {
      const product = await lookupProduct(id)
      if (product) boats.value[id] = product.name
      else withdrawn.value[id] = true
    }),
  ])
}

function adopt(result: PageResponse<ChatResponse>) {
  threads.value = result.content
  totalPages.value = result.totalPages
  isFirstPage.value = result.first
  isLastPage.value = result.last
  // Deliberately not awaited: the list is renderable without the names, and holding the whole
  // page back on a directory lookup would trade a fast inbox for a tidy one.
  void resolveNames(result.content)
}

function fetchPage() {
  return api.get<PageResponse<ChatResponse>>('/chats', {
    query: { page: page.value, size: PAGE_SIZE },
  })
}

async function load() {
  state.value = 'loading'

  try {
    adopt(await fetchPage())
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
 * A poll that fails is silent. The inbox on screen is still the inbox as of a few seconds ago,
 * and replacing it with an error because one refresh missed would be a worse answer than a
 * slightly stale list — the next tick, or the next return to the tab, corrects it.
 */
const polling = usePolling(async () => {
  if (state.value === 'error') return
  try {
    adopt(await fetchPage())
  } catch {
    /* keep what is on screen */
  }
})

onMounted(() => {
  load()
  polling.start()
})
</script>

<template>
  <div class="page inbox">
    <header class="head">
      <p class="eyebrow">Negotiations</p>
      <h1>Messages</h1>
    </header>

    <p v-if="state === 'loading' && !hasLoaded" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <p v-if="threads.length === 0" class="empty">
        No conversations yet. Open a listing and message its owner — every negotiation on this site
        starts from a boat.
      </p>

      <!-- A list, not a table. These rows have four fields and no column a reader would ever want
           to sort or compare down — the server fixes the order and ignores `?sort=` — so table
           semantics would promise an interaction that does not exist. -->
      <ul v-else class="threads" :class="{ busy }">
        <li v-for="chat in threads" :key="chat.id">
          <!-- The whole row is the link, so the target is the size of the row rather than the
               size of the name. `String(chat.id)` because route params are strings and Vue Router
               warns about a number here. -->
          <RouterLink :to="{ name: 'thread', params: { id: String(chat.id) } }" class="row">
            <!-- An em dash while the name is still resolving, rather than a skeleton or a
                 spinner. The row is already useful without it — the time and the unread count are
                 what people scan for — and a placeholder that changes width would shift the two
                 columns beside it when the name lands. -->
            <span class="who">{{ people[counterpartyId(chat, viewerId)] ?? '—' }}</span>

            <span class="about">
              <em v-if="withdrawn[chat.productId]">No longer listed</em>
              <template v-else>{{ boats[chat.productId] ?? '' }}</template>
            </span>

            <!-- `lastMessageAt` and not `createdAt`: the inbox is ordered by activity, so the
                 time shown has to be the one it is ordered by or the list looks unsorted. -->
            <span class="when">{{ relativeTime(chat.lastMessageAt) }}</span>

            <!-- Per viewer: messages you wrote yourself never count towards this. -->
            <span v-if="chat.unreadCount > 0" class="unread">
              {{ chat.unreadCount }}
              <span class="sr-only">unread</span>
            </span>
          </RouterLink>
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
.inbox {
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

.threads {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--rule);
  transition: opacity var(--d-pop) var(--ease-out);
}
/* A page turn dims what is there rather than emptying the list — the rows are about to be
   replaced by rows of the same shape, and a flash of nothing between them reads as a fault. */
.threads.busy {
  opacity: 0.55;
}

.threads li {
  border-bottom: 1px solid var(--rule-soft);
}

/* A row is a line of a ledger, not a card: name, subject, time, count. The vertical rhythm is
   what makes it scannable — a denser list would need rules doing the same work. */
/* `minmax(0, …)` on both flexible columns, not plain `12rem` and `1fr`. A grid track's default
   minimum is `auto`, which refuses to shrink below its content — so a long boat name would push
   the time and the unread count off the row instead of ellipsising. This is what makes
   `text-overflow` work at all. */
.row {
  display: grid;
  grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-2);
  text-decoration: none;
  transition: background-color var(--d-pop) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .row:hover {
    background: var(--wash);
  }
}

.who {
  font-weight: 500;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.about {
  font-family: var(--font-display);
  font-size: var(--step-1);
  color: var(--ink-mid);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.about em {
  font-family: var(--font-body);
  font-size: var(--step--1);
  font-style: normal;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.when {
  font-size: var(--step--1);
  color: var(--ink-faint);
  white-space: nowrap;
}

/* Mono, like every other figure in this interface, and tabular so a column of counts lines up. */
.unread {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--step--1);
  min-width: 1.6rem;
  text-align: center;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--ink);
  color: var(--ground);
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
  /* Two lines instead of four columns: at this width the subject would be three ellipsised
     characters, which says less than nothing. */
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-1) var(--sp-3);
  }
  .about {
    grid-column: 1;
    grid-row: 2;
    font-size: var(--step-0);
  }
  .when {
    grid-column: 2;
    grid-row: 2;
  }
  .unread {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
