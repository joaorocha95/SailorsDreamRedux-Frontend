<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import type { UserResponse } from '@/types/api'

/**
 * The way back from a deactivated account.
 *
 * A self-deactivated user signs in normally and stays deactivated — that is deliberate on the
 * server, because reactivating requires being authenticated, so locking them out at the door
 * would leave them with no way to undo it. The session is real; `isActive` is what is false.
 *
 * So this is an offer, not a wall. Browsing needs no account at all, and nothing here forces a
 * decision before the visitor is allowed to leave.
 */

const auth = useAuthStore()
const router = useRouter()

const working = ref(false)
const errorMessage = ref('')

async function reactivate() {
  if (!auth.user) return

  working.value = true
  errorMessage.value = ''

  try {
    const updated = await api.patch<UserResponse>(`/users/${auth.user.id}/reactivate`)
    auth.setUser(updated)
    await router.replace({ name: 'browse' })
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the server. Try again in a moment.'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="page shell">
    <div class="panel">
      <h1>Your account is deactivated</h1>

      <p class="lede">
        You are signed in, but the account is switched off: your listings are unpublished and nobody
        can start a conversation with you. You can turn it back on whenever you like.
      </p>

      <!-- Said before the button, not discovered afterwards: the server deliberately does not
           republish listings on reactivation, and finding that out later would feel like a bug. -->
      <p class="caveat">
        Reactivating does not republish the listings that were unpublished. You will need to publish
        those again yourself.
      </p>

      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

      <div class="actions">
        <button type="button" class="submit" :disabled="working" @click="reactivate">
          {{ working ? 'Reactivating…' : 'Reactivate my account' }}
        </button>

        <RouterLink :to="{ name: 'browse' }" class="quiet">Keep browsing instead</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  justify-content: center;
  padding: clamp(2.5rem, 8vw, 6rem) 0 var(--sp-8);
}

.panel {
  width: 100%;
  max-width: 32rem;
}

h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
  line-height: 1.1;
}

.lede {
  color: var(--ink-soft);
  margin: var(--sp-4) 0;
  max-width: var(--measure);
}

.caveat {
  font-size: var(--step--1);
  color: var(--ink-soft);
  border-left: 2px solid var(--caution);
  padding: var(--sp-3) var(--sp-4);
  background: var(--wash);
  max-width: var(--measure);
}

.error {
  margin-top: var(--sp-4);
  color: var(--critical);
  font-size: var(--step--1);
  background: var(--critical-wash);
  border-left: 2px solid var(--critical);
  padding: var(--sp-3) var(--sp-4);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-5);
  margin-top: var(--sp-6);
}

.submit {
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.65rem 1rem;
  font: inherit;
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform var(--d-press) var(--ease-out);
}
.submit:active:not(:disabled) {
  transform: scale(0.97);
}
.submit:disabled {
  background: var(--ink-faint);
  cursor: default;
  transform: none;
}

.quiet {
  font-size: var(--step--1);
  color: var(--ink-soft);
}
</style>
