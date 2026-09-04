<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import AdminNav from '@/components/AdminNav.vue'
import { relativeTime } from '@/lib/chats'
import { lookupUser } from '@/lib/directory'
import { ApiError, api } from '@/lib/http'
import { REPORT_REASON_LABELS } from '@/lib/report'
import { useAuthStore } from '@/stores/auth'
import type { PageResponse, ReportResponse, UserResponse } from '@/types/api'

/**
 * The moderation queue.
 *
 * **Oldest first, and not sortable** — the server drops any `?sort=` it is handed, because the
 * report that has been waiting longest is the most overdue and a queue has exactly one useful
 * order. Same call the inbox makes, for the opposite ordering.
 *
 * The loop this closes: somebody reports, staff read this, staff act with `PATCH /users/{id}/ban`.
 * So the ban lives in the row rather than a page away — the decision is made here, with the
 * evidence on screen.
 */

const PAGE_SIZE = 20

/**
 * The server's own default for `?reviewed=` is *unset*, meaning everything — deliberately, so
 * that staff auditing what was already handled are not hidden behind a parameter nobody knows to
 * pass. This page defaults to pending anyway, because that is the work; the other two are one
 * click away rather than undiscoverable.
 */
const FILTERS = ['pending', 'reviewed', 'all'] as const
type Filter = (typeof FILTERS)[number]
const filter = ref<Filter>('pending')

const auth = useAuthStore()

const reports = ref<ReportResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

const page = ref(0)
const totalPages = ref(0)
const totalElements = ref(0)
const isFirstPage = ref(true)
const isLastPage = ref(true)
const hasLoaded = ref(false)

const people = ref<Record<number, UserResponse>>({})
/**
 * Two markers, not one. A report id and a user id come from different sequences, so a single
 * `working` would grey out an unrelated row's buttons whenever the two numbers happened to match
 * — the same collision the inbox avoids by keying names separately.
 */
const workingReport = ref<number | null>(null)
const workingUser = ref<number | null>(null)
const rowError = ref('')

const busy = computed(() => state.value === 'loading' && hasLoaded.value)

function nameOf(userId: number): string {
  return people.value[userId]?.name ?? `#${userId}`
}

/** Reports carry ids only, like an inbox row. Same memoised lookup, so a re-poll costs nothing. */
async function resolvePeople(rows: readonly ReportResponse[]) {
  const ids = new Set<number>()
  for (const report of rows) {
    ids.add(report.reporterId)
    ids.add(report.reportedUserId)
  }
  await Promise.all(
    [...ids].map(async (id) => {
      const user = await lookupUser(id)
      if (user) people.value[id] = user
    }),
  )
}

async function load() {
  state.value = 'loading'
  rowError.value = ''

  try {
    const result = await api.get<PageResponse<ReportResponse>>('/reports', {
      query: {
        // Unset for "all". `false` has to survive the trip — the query builder drops undefined,
        // null and empty strings, not falsy values, which is what makes "pending" expressible.
        reviewed: filter.value === 'all' ? undefined : filter.value === 'reviewed',
        page: page.value,
        size: PAGE_SIZE,
      },
    })
    reports.value = result.content
    totalPages.value = result.totalPages
    totalElements.value = result.totalElements
    isFirstPage.value = result.first
    isLastPage.value = result.last
    state.value = 'ready'
    hasLoaded.value = true
    void resolvePeople(result.content)
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

/**
 * Clearing a report. Carries no verdict, deliberately: whether the account was banned is recorded
 * on the account, not here, so the two can never disagree.
 */
async function markReviewed(report: ReportResponse) {
  workingReport.value = report.id
  rowError.value = ''

  try {
    const updated = await api.patch<ReportResponse>(`/reports/${report.id}/reviewed`)
    if (filter.value === 'pending') {
      // It no longer belongs on this page, so it leaves rather than sitting there greyed out.
      reports.value = reports.value.filter((item) => item.id !== updated.id)
      totalElements.value = Math.max(0, totalElements.value - 1)
    } else {
      reports.value = reports.value.map((item) => (item.id === updated.id ? updated : item))
    }
  } catch (error) {
    rowError.value =
      error instanceof ApiError ? error.message : 'Could not mark that report reviewed.'
  } finally {
    workingReport.value = null
  }
}

/**
 * Banning from the queue. Idempotent, so a second press is not an error, and it also unpublishes
 * the account's listings on the way.
 *
 * A **409** means the account is closed. Closure is final on this server, so neither ban nor unban
 * can touch it — the flag would be meaningless on an account nobody can sign into.
 */
async function setBanned(userId: number, banned: boolean) {
  workingUser.value = userId
  rowError.value = ''

  try {
    const path = banned ? 'ban' : 'unban'
    people.value[userId] = await api.patch<UserResponse>(`/users/${userId}/${path}`)
  } catch (error) {
    rowError.value =
      error instanceof ApiError ? error.message : 'That did not go through. Try again in a moment.'
  } finally {
    workingUser.value = null
  }
}

function goToPage(next: number) {
  page.value = next
  load()
  window.scrollTo(0, 0)
}

watch(filter, () => {
  page.value = 0
  load()
})

onMounted(load)
</script>

<template>
  <div class="page admin">
    <AdminNav />

    <header class="head">
      <h1>Reports</h1>
      <div class="filters" role="group" aria-label="Filter reports">
        <button
          v-for="option in FILTERS"
          :key="option"
          type="button"
          :class="{ on: filter === option }"
          :aria-pressed="filter === option"
          @click="filter = option"
        >
          {{ option }}
        </button>
      </div>
    </header>

    <p v-if="state === 'loading' && !hasLoaded" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <p v-if="reports.length === 0" class="empty">
        {{ filter === 'pending' ? 'Nothing waiting. The queue is clear.' : 'No reports here.' }}
      </p>

      <!-- Same reasoning as browse: the count is what answers the filter buttons. Safe to
           announce here because it changes on a deliberate press, not on every keystroke — which
           is why the user search on the directory page is deliberately *not* a live region. -->
      <p v-else class="count" role="status">
        {{ totalElements }} report{{ totalElements === 1 ? '' : 's' }}
      </p>

      <p v-if="rowError" class="row-error" role="alert">{{ rowError }}</p>

      <ul v-if="reports.length" class="rows" :class="{ busy }">
        <li v-for="report in reports" :key="report.id">
          <div class="what">
            <p class="reason">
              {{ REPORT_REASON_LABELS[report.reason] }}
              <span v-if="report.reviewed" class="cleared">reviewed</span>
            </p>
            <p class="who">
              <strong>{{ nameOf(report.reportedUserId) }}</strong>
              reported by {{ nameOf(report.reporterId) }} · {{ relativeTime(report.createdAt) }}
            </p>
            <p v-if="report.details" class="details">{{ report.details }}</p>
            <p v-else class="details none">No further detail given.</p>
          </div>

          <div class="actions">
            <button
              v-if="!report.reviewed"
              type="button"
              class="primary"
              :disabled="workingReport === report.id"
              @click="markReviewed(report)"
            >
              Mark reviewed
            </button>

            <!-- Both verbs, not a toggle. `isActive` is one boolean over three separate flags —
                 deactivated, banned, closed — so nothing in the response says *why* an account is
                 off, and a toggle would have to guess. Both are idempotent, so offering both is
                 safe where guessing would not be. -->
            <!-- Never your own account: banning the moderator reading the queue would lock
                 them out of it, and the server has no guard against it. -->
            <template v-if="report.reportedUserId !== auth.user?.id">
              <button
                type="button"
                :disabled="workingUser === report.reportedUserId"
                @click="setBanned(report.reportedUserId, true)"
              >
                Ban
              </button>
              <button
                type="button"
                :disabled="workingUser === report.reportedUserId"
                @click="setBanned(report.reportedUserId, false)"
              >
                Unban
              </button>
            </template>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="pages" aria-label="Pagination">
        <button type="button" :disabled="isFirstPage || busy" @click="goToPage(page - 1)">
          Previous
        </button>
        <span>Page {{ page + 1 }} of {{ totalPages }}</span>
        <button type="button" :disabled="isLastPage || busy" @click="goToPage(page + 1)">
          Next
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
@import './admin.css';

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}

.filters {
  display: flex;
  gap: var(--sp-2);
}
.filters button {
  font-size: var(--step--1);
  text-transform: capitalize;
  background: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  color: var(--ink-soft);
  cursor: pointer;
}
.filters button.on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--ground);
}

.count {
  font-size: var(--step--1);
  color: var(--ink-faint);
  margin-bottom: var(--sp-3);
}

.rows li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-5);
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--rule-soft);
}

.reason {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--caution);
}
.cleared {
  color: var(--positive);
  border: 1px solid currentcolor;
  border-radius: 999px;
  padding: 0 0.5rem;
}

.who {
  margin-top: var(--sp-1);
  color: var(--ink-soft);
}
.who strong {
  color: var(--ink);
  font-weight: 500;
}

/* Pre-wrap: this is somebody's account of what happened, and a thousand characters of it may well
   have been typed with line breaks that carry meaning. */
.details {
  margin-top: var(--sp-2);
  max-width: var(--measure);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ink);
}
.details.none {
  color: var(--ink-faint);
}
</style>
