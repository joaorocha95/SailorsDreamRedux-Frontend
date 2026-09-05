<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AdminNav from '@/components/AdminNav.vue'
import { ApiError, api } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import type { UserResponse } from '@/types/api'

/**
 * The user directory.
 *
 * `GET /users` is **unpaged** — the whole table in one response — so the search here is a filter
 * over what is already loaded rather than a query. That is fine at this size and wrong at any
 * real one; it is the first thing to change if the platform grows.
 *
 * **What this page cannot tell you.** `isActive` is a single boolean derived from three separate
 * flags — deactivated, banned, closed — and the API deliberately does not break them out: the
 * reasoning was that which one applies is moderation detail with no admin surface to show it on.
 * That surface is this page, so the reasoning has run out. Until the response says which, a row
 * can only report *whether* an account is usable, and both verbs are offered rather than a toggle
 * that would have to guess. Both are idempotent, so offering both is safe where guessing is not.
 */

const auth = useAuthStore()

const users = ref<UserResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

const search = ref('')
const working = ref<number | null>(null)
const rowError = ref('')

/**
 * The search, over what is already loaded rather than over the server.
 *
 * `GET /users` is unpaged — the whole table in one response — so there is nothing to query
 * against; filtering in memory is the only option the endpoint leaves. Name *and* email, because
 * staff acting on a report have one or the other and rarely both.
 *
 * This is the page that breaks first if the platform grows. See item 10 on the roadmap's list.
 */
const matches = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (needle === '') return users.value
  // `email` is nullable on the wire — `GET /users/{id}` withholds it from anyone who is not the
  // account's owner or an admin. This page reads `GET /users`, which is admin-only and therefore
  // always the full record, so the fallback is unreachable rather than a case being handled: it
  // is here because the type is honest about a shape this route does not serve.
  return users.value.filter(
    (user) =>
      user.name.toLowerCase().includes(needle) || (user.email ?? '').toLowerCase().includes(needle),
  )
})

async function load() {
  state.value = 'loading'
  rowError.value = ''

  try {
    users.value = await api.get<UserResponse[]>('/users')
    state.value = 'ready'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

/**
 * Banning also unpublishes everything the account has listed, which is why it is worth doing here
 * rather than leaving to a database.
 *
 * A **409** means the account is closed. Closure is final on this server, so neither verb can
 * touch it — the flag would be meaningless on an account nobody can sign into again.
 */
async function setBanned(user: UserResponse, banned: boolean) {
  working.value = user.id
  rowError.value = ''

  try {
    const path = banned ? 'ban' : 'unban'
    const updated = await api.patch<UserResponse>(`/users/${user.id}/${path}`)
    users.value = users.value.map((item) => (item.id === updated.id ? updated : item))
  } catch (error) {
    rowError.value =
      error instanceof ApiError ? error.message : 'That did not go through. Try again in a moment.'
  } finally {
    working.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page admin">
    <AdminNav />

    <h1>Users</h1>
    <p class="lede">
      Banning an account switches it off and unpublishes its listings; it can be lifted. A row
      showing <em>not active</em> may be banned, may have been switched off by its owner, or may be
      closed — the API reports one flag for all three, so this page cannot tell them apart.
    </p>

    <p v-if="state === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <!-- Labelled but not visibly: the placeholder repeats it, and a work queue is a page where
           the vertical space matters more than on any other. The label still has to exist, since a
           placeholder disappears the moment anything is typed into it. -->
      <label class="sr-only" for="user-search">Search by name or email</label>
      <input
        id="user-search"
        v-model="search"
        type="search"
        class="search"
        placeholder="Search by name or email"
      />

      <!-- Deliberately *not* a live region, unlike the counts on browse and the report queue.
           This one changes on every keystroke, where those change on a debounce or a deliberate
           press — announcing it would talk over the typing it is reporting on. -->
      <p class="count">
        {{ matches.length }} of {{ users.length }} account{{ users.length === 1 ? '' : 's' }}
      </p>

      <p v-if="rowError" class="row-error" role="alert">{{ rowError }}</p>

      <p v-if="matches.length === 0" class="empty">Nobody matches that.</p>

      <ul v-else class="rows">
        <li v-for="user in matches" :key="user.id">
          <div class="who">
            <p class="name">
              {{ user.name }}
              <span v-if="user.accountType && user.accountType !== 'USER'" class="tier">{{
                user.accountType
              }}</span>
              <span v-if="user.id === auth.user?.id" class="tier you">you</span>
            </p>
            <p class="email">{{ user.email }}</p>
          </div>

          <!-- One word, because one word is all the API offers. `isActive` is a single boolean
               over three separate flags — deactivated, banned, closed — so this can say whether an
               account is usable and never why. The lede above says so plainly rather than letting
               a moderator infer a reason that is not there. -->
          <span class="state" :class="{ off: !user.isActive }">
            {{ user.isActive ? 'active' : 'not active' }}
          </span>

          <div class="actions">
            <button
              type="button"
              :disabled="working === user.id || user.id === auth.user?.id"
              @click="setBanned(user, true)"
            >
              Ban
            </button>
            <button
              type="button"
              :disabled="working === user.id || user.id === auth.user?.id"
              @click="setBanned(user, false)"
            >
              Unban
            </button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
@import './admin.css';

.lede {
  max-width: var(--measure);
  margin: var(--sp-2) 0 var(--sp-5);
  color: var(--ink-soft);
  font-size: var(--step--1);
}

.search {
  width: 100%;
  max-width: 22rem;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
}

.count {
  margin: var(--sp-3) 0;
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.rows li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--rule-soft);
}

.name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.email {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.tier {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--caution);
  border: 1px solid currentcolor;
  border-radius: 999px;
  padding: 0 0.45rem;
}
/* Your own row, so a moderator can see at a glance which account they are signed in as. */
.tier.you {
  color: var(--ink-faint);
}

.state {
  font-size: var(--step--1);
  color: var(--positive);
  white-space: nowrap;
}
.state.off {
  color: var(--ink-faint);
}

@media (max-width: 640px) {
  .rows li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .actions {
    grid-column: 1 / -1;
  }
}
</style>
