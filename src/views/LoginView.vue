<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'

/**
 * Sign in. Also the first write the app makes, so it is what proves the CSRF handshake works:
 * the token cookie was issued by the `GET /auth/me` during startup, and the HTTP client echoes
 * it back in `X-XSRF-TOKEN`.
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')
/** Set from Retry-After when the signup/login quota refuses us. */
const retryAfter = ref<number | null>(null)

async function submit() {
  submitting.value = true
  errorMessage.value = ''
  retryAfter.value = null

  try {
    await auth.login({ email: email.value, password: password.value })
    const redirect = route.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : { name: 'browse' })
  } catch (error) {
    if (error instanceof ApiError) {
      // The server deliberately says the same thing for a wrong password and an unknown address,
      // so the form must not embellish it into something more specific.
      errorMessage.value = error.message
      retryAfter.value = error.retryAfterSeconds
    } else {
      errorMessage.value = 'Could not reach the server. Try again in a moment.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page shell">
    <div class="panel">
      <h1>Sign in</h1>
      <p class="lede">To message an owner, save a listing, or publish one of your own.</p>

      <form @submit.prevent="submit">
        <label>
          <span>Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            :disabled="submitting"
          />
        </label>

        <label>
          <span>Password</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="submitting"
          />
        </label>

        <p v-if="errorMessage" class="error" role="alert">
          {{ errorMessage }}
          <span v-if="retryAfter" class="retry-note">Try again in {{ retryAfter }}s.</span>
        </p>

        <button type="submit" class="submit" :disabled="submitting">
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
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
}

.submit {
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.65rem 1rem;
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  margin-top: var(--sp-2);
}
.submit:disabled {
  background: var(--ink-faint);
  cursor: default;
  /* The global :active scale would otherwise still fire on a disabled control. */
  transform: none;
}
</style>
