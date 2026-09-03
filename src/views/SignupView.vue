<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { useRetryAfter } from '@/lib/retry-after'
import { useAuthStore } from '@/stores/auth'
import type { CreateUserRequest, UserResponse } from '@/types/api'

/**
 * Create an account.
 *
 * `POST /users` is the one IP-keyed quota on the server — there is no account to key on yet, and
 * it is the load-bearing limit, because every per-account limit is only as strong as the cost of
 * opening another account. So a 429 here is expected traffic, not an incident, and the form
 * treats it as a wait rather than an error to argue with.
 *
 * Signing up does not start a session; the server returns the created user and nothing else. So
 * this signs in immediately afterwards with the credentials just typed, which is the difference
 * between finishing the task and being handed a second form asking for the same two fields.
 */

const auth = useAuthStore()
const router = useRouter()

const form = ref<CreateUserRequest>({
  name: '',
  email: '',
  password: '',
  birthDate: '',
  phoneNumber: '',
})

const submitting = ref(false)
const errorMessage = ref('')
/** Set when the account exists but the automatic sign-in afterwards did not go through. */
const signedUpButNotIn = ref(false)

const { secondsLeft, start: startWait } = useRetryAfter()

const blocked = computed(() => submitting.value || secondsLeft.value > 0)

/** `@Past` on the server. Today is not a valid birth date, so the picker should not offer it. */
const latestBirthDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

async function submit() {
  submitting.value = true
  errorMessage.value = ''
  signedUpButNotIn.value = false

  try {
    await api.post<UserResponse>('/users', form.value)
  } catch (error) {
    if (error instanceof ApiError) {
      errorMessage.value = error.message
      startWait(error.retryAfterSeconds)
    } else {
      errorMessage.value = 'Could not reach the server. Try again in a moment.'
    }
    submitting.value = false
    return
  }

  // The account exists from here on. A failure below is about the session, not the signup, and
  // must not read as though the account was never created — hence the separate state.
  try {
    await auth.login({ email: form.value.email, password: form.value.password })
    await router.replace({ name: 'browse' })
  } catch {
    signedUpButNotIn.value = true
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page shell">
    <div class="panel">
      <h1>Create an account</h1>
      <p class="lede">
        To message an owner, save a listing, or publish one of your own. Browsing needs no account
        at all.
      </p>

      <div v-if="signedUpButNotIn" class="done" role="status">
        <p><strong>Your account is ready.</strong></p>
        <p>We could not sign you in automatically, but the account exists — sign in as usual.</p>
        <RouterLink :to="{ name: 'login' }" class="submit as-link">Sign in</RouterLink>
      </div>

      <form v-else @submit.prevent="submit">
        <label>
          <span>Name</span>
          <input v-model="form.name" type="text" autocomplete="name" required :disabled="blocked" />
        </label>

        <label>
          <span>Email</span>
          <input
            v-model="form.email"
            type="email"
            autocomplete="email"
            required
            :disabled="blocked"
          />
        </label>

        <label>
          <span>Password</span>
          <input
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            required
            :disabled="blocked"
          />
        </label>

        <label>
          <span>Date of birth</span>
          <input
            v-model="form.birthDate"
            type="date"
            autocomplete="bday"
            required
            :max="latestBirthDate"
            :disabled="blocked"
          />
        </label>

        <label>
          <span>Phone</span>
          <input
            v-model="form.phoneNumber"
            type="tel"
            autocomplete="tel"
            required
            :disabled="blocked"
          />
        </label>

        <p v-if="errorMessage" class="error" role="alert">
          {{ errorMessage }}
          <!-- Counted down rather than left as a flat number, so the wait visibly ends. -->
          <span v-if="secondsLeft > 0" class="retry-note">
            You can try again in {{ secondsLeft }}s.
          </span>
        </p>

        <button type="submit" class="submit" :disabled="blocked">
          <template v-if="secondsLeft > 0">Wait {{ secondsLeft }}s</template>
          <template v-else-if="submitting">Creating…</template>
          <template v-else>Create account</template>
        </button>
      </form>

      <p class="alt">
        Already have an account?
        <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
      </p>
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
  max-width: 24rem;
}

h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}

.lede {
  color: var(--ink-soft);
  margin: var(--sp-3) 0 var(--sp-6);
  font-size: var(--step--1);
}

form {
  display: grid;
  gap: var(--sp-4);
}

label {
  display: grid;
  gap: var(--sp-2);
}
label span {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

input {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 0.6rem 0.7rem;
  font: inherit;
  color: var(--ink);
  transition: border-color var(--d-pop) var(--ease-out);
}
input:focus {
  border-color: var(--ink-faint);
}
input:disabled {
  color: var(--ink-faint);
}

.error {
  color: var(--critical);
  font-size: var(--step--1);
  background: var(--critical-wash);
  border-left: 2px solid var(--critical);
  padding: var(--sp-3) var(--sp-4);
}
.retry-note {
  display: block;
  color: var(--ink-soft);
  margin-top: var(--sp-1);
  font-variant-numeric: tabular-nums;
}

.done {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  border-left: 2px solid var(--positive);
  padding: var(--sp-4) var(--sp-5);
  background: var(--wash);
}
.done p {
  color: var(--ink-soft);
  font-size: var(--step--1);
}
.done strong {
  color: var(--ink);
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
  margin-top: var(--sp-2);
  font-variant-numeric: tabular-nums;
}
.submit:disabled {
  background: var(--ink-faint);
  cursor: default;
  transform: none;
}
.as-link {
  text-decoration: none;
  display: inline-block;
  margin-top: 0;
}

.alt {
  margin-top: var(--sp-5);
  font-size: var(--step--1);
  color: var(--ink-soft);
}
</style>
