<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { ApiError, api } from '@/lib/http'
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_HINTS,
  REPORT_REASON_LABELS,
  emptyReport,
  hasReportProblems,
  reportProblems,
} from '@/lib/report'
import { useRetryAfter } from '@/lib/retry-after'
import { useBlocksStore } from '@/stores/blocks'
import { REPORT_REASONS } from '@/types/api'
import type { CreateReportRequest, ReportResponse } from '@/types/api'

/**
 * Blocking and reporting one person, from wherever they are in front of you.
 *
 * The two are different acts and the API treats them so. **Blocking is between the two of you**:
 * it is idempotent, reversible, has no retirement gate anywhere — a deactivated user must still
 * be able to protect themselves — and it silences the conversation without erasing it.
 * **Reporting is a private message to staff**: it is rate-limited, it is not gated on ever having
 * negotiated, and it cannot be taken back.
 *
 * Neither is offered behind a confirmation. A safety control that asks "are you sure" twice is
 * one somebody being harassed has to fight through, and blocking is undone by the button that
 * replaces it.
 */

const props = defineProps<{
  userId: number
  name?: string | null
  /** Shown after a block, because what it does depends on where you are. */
  context: 'thread' | 'listing'
}>()

const blocks = useBlocksStore()
const { secondsLeft: reportWait, start: startReportWait } = useRetryAfter()

const who = computed(() => props.name ?? 'this person')

const working = ref(false)
const blockError = ref('')

const reportOpen = ref(false)
const draft = ref(emptyReport())
const showProblems = ref(false)
const sending = ref(false)
const reportError = ref('')
const reported = ref(false)

const blocked = computed(() => blocks.isBlocked(props.userId))
const problems = computed(() => reportProblems(draft.value))
const detailsLeft = computed(() => REPORT_DETAILS_MAX - draft.value.details.length)

async function toggleBlock() {
  if (working.value) return
  working.value = true
  blockError.value = ''

  try {
    if (blocked.value) await blocks.unblock(props.userId)
    else await blocks.block(props.userId)
  } catch (error) {
    blockError.value =
      error instanceof ApiError ? error.message : 'That did not go through. Try again in a moment.'
  } finally {
    working.value = false
  }
}

async function submitReport() {
  showProblems.value = true
  if (hasReportProblems(problems.value) || sending.value || reportWait.value > 0) return

  // Unreachable — `reportProblems` refuses an unchosen reason — and written as a return rather
  // than a fallback to OTHER, because a silent default here would file a report saying something
  // the person never chose.
  const reason = draft.value.reason
  if (reason === '') return

  sending.value = true
  reportError.value = ''

  try {
    const body: CreateReportRequest = {
      reportedUserId: props.userId,
      reason,
      details: draft.value.details.trim() === '' ? undefined : draft.value.details.trim(),
    }
    await api.post<ReportResponse>('/reports', body)
    reported.value = true
    reportOpen.value = false
    draft.value = emptyReport()
  } catch (error) {
    if (!(error instanceof ApiError)) {
      reportError.value = 'The report did not send. Check your connection and try again.'
      return
    }

    startReportWait(error.retryAfterSeconds)

    if (error.status === 400) {
      // The one place in this client where the server's `detail` is deliberately not shown. It
      // reads "User 3 already has an unreviewed report against user 7", which is accurate and
      // written for somebody reading a log. The only other 400 here is a self-report, which
      // nothing in the UI offers, so this explains the case that actually happens.
      reportError.value =
        `You have already reported ${who.value}, and staff have not read it yet. ` +
        'A second report would only make the queue longer — the first one still counts, and ' +
        'you can report again once it has been reviewed.'
      return
    }

    reportError.value = error.message
  } finally {
    sending.value = false
  }
}

onMounted(() => blocks.ensureLoaded())
</script>

<template>
  <div class="safety">
    <div class="controls">
      <button type="button" class="link-btn" :disabled="working" @click="toggleBlock">
        {{ blocked ? `Unblock ${who}` : `Block ${who}` }}
      </button>

      <button
        v-if="!reported && !reportOpen"
        type="button"
        class="link-btn"
        @click="reportOpen = true"
      >
        Report
      </button>
      <span v-else-if="reported" class="filed" role="status">Reported. Staff will look at it.</span>
    </div>

    <p v-if="blocked" class="state">
      <template v-if="context === 'thread'">
        This conversation has left both inboxes and neither of you can post in it. Everything said
        is still here, and unblocking puts it back.
      </template>
      <template v-else>
        You will not see messages from {{ who }}, and any conversation between you has left both
        inboxes.
      </template>
    </p>

    <p v-if="blockError" class="problem" role="alert">{{ blockError }}</p>

    <form v-if="reportOpen" class="report" @submit.prevent="submitReport">
      <p class="lede">
        Reports go to staff, not to {{ who }}. Blocking is the faster way to stop hearing from
        somebody — this is for behaviour that should be looked at.
      </p>

      <fieldset class="reasons">
        <legend>What happened?</legend>
        <label v-for="reason in REPORT_REASONS" :key="reason" class="reason">
          <input v-model="draft.reason" type="radio" name="reason" :value="reason" />
          <span class="reason-text">
            <span class="reason-label">{{ REPORT_REASON_LABELS[reason] }}</span>
            <span class="reason-hint">{{ REPORT_REASON_HINTS[reason] }}</span>
          </span>
        </label>
        <p v-if="showProblems && problems.reason" class="problem">{{ problems.reason }}</p>
      </fieldset>

      <div class="field">
        <label for="report-details">Anything that would help</label>
        <textarea
          id="report-details"
          v-model="draft.details"
          rows="4"
          :maxlength="REPORT_DETAILS_MAX"
          :disabled="sending"
        ></textarea>
        <!-- A thousand characters, not the 255 most fields here carry. Only counted down near the
             end, since almost nobody will approach it. -->
        <p v-if="detailsLeft <= 120" class="hint">{{ detailsLeft }} characters left</p>
        <p v-if="showProblems && problems.details" class="problem">{{ problems.details }}</p>
      </div>

      <div class="actions">
        <button type="submit" class="cta" :disabled="sending || reportWait > 0">
          <template v-if="reportWait > 0">Wait {{ reportWait }}s</template>
          <template v-else>{{ sending ? 'Sending…' : 'Send report' }}</template>
        </button>
        <button type="button" class="link-btn" :disabled="sending" @click="reportOpen = false">
          Cancel
        </button>
      </div>

      <p v-if="reportError" class="problem" role="alert">{{ reportError }}</p>
    </form>
  </div>
</template>

<style scoped>
.safety {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
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
@media (hover: hover) and (pointer: fine) {
  .link-btn:hover {
    color: var(--ink);
  }
}

.filed,
.state {
  font-size: var(--step--1);
  color: var(--ink-faint);
  max-width: var(--measure);
}

.report {
  display: grid;
  gap: var(--sp-4);
  width: 100%;
  max-width: var(--measure);
  padding: var(--sp-4);
  background: var(--wash);
  border-radius: 3px;
}

.lede {
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.reasons {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-3);
}
.reasons legend,
.field label {
  font-size: var(--step--1);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: var(--sp-2);
}

/* The hint sits under the label rather than beside it: these are read while deciding, and a
   second column would make the two options nearest in meaning the two hardest to compare. */
.reason {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: start;
  cursor: pointer;
}
.reason-text {
  display: grid;
  gap: 2px;
}
.reason-label {
  color: var(--ink);
}
.reason-hint {
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.field {
  display: grid;
}
.field textarea {
  width: 100%;
  resize: vertical;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
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
  background: var(--surface);
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}

.hint {
  margin-top: var(--sp-2);
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.problem {
  margin-top: var(--sp-2);
  font-size: var(--step--1);
  color: var(--critical);
}
</style>
