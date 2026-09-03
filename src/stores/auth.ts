import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api, setUnauthorizedHandler } from '@/lib/http'
import type { LoginRequest, UserResponse } from '@/types/api'

/**
 * Who is signed in.
 *
 * The session lives in a cookie the JavaScript cannot read, so the only way to know whether one
 * exists is to ask: `GET /auth/me` at startup. That call does double duty — it also primes the
 * `XSRF-TOKEN` cookie, so the first write the user attempts already has a token to send.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserResponse | null>(null)

  /**
   * `idle` before the session has been checked. Route guards must wait for this to leave `idle`,
   * or a refresh on a protected page bounces the user to login before the check has finished.
   */
  const status = ref<'idle' | 'loading' | 'ready'>('idle')

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.accountType === 'ADMIN')

  /**
   * A user who deactivated their own account can still sign in — that is deliberate on the
   * server, because reactivating requires being authenticated. The app should offer them a way
   * back rather than treating this as a locked account.
   */
  const isDeactivated = computed(() => user.value !== null && !user.value.isActive)

  let bootstrapped: Promise<void> | null = null

  /**
   * Establish the session state once per page load. Repeated calls share the same promise, so
   * several route guards resolving at once don't each fire a request.
   */
  function bootstrap(): Promise<void> {
    if (bootstrapped) return bootstrapped

    status.value = 'loading'
    bootstrapped = api
      .get<UserResponse>('/auth/me')
      .then((me) => {
        user.value = me
      })
      .catch((error: unknown) => {
        // 401 here is the ordinary answer for a signed-out visitor, not a failure.
        if (error instanceof ApiError && error.isUnauthenticated) {
          user.value = null
          return
        }
        // Anything else — the API being down, the proxy misconfigured — should surface rather
        // than silently presenting the app as signed out.
        throw error
      })
      .finally(() => {
        status.value = 'ready'
      })

    return bootstrapped
  }

  async function login(credentials: LoginRequest) {
    user.value = await api.post<UserResponse>('/auth/login', credentials)
    status.value = 'ready'
  }

  async function logout() {
    try {
      await api.post<void>('/auth/logout')
    } finally {
      // Clear locally whatever the server said. A logout that failed still means the user asked
      // to be signed out, and leaving them looking signed in is the worse outcome.
      user.value = null
    }
  }

  /** Called by the HTTP layer when any request comes back 401. */
  function clear() {
    user.value = null
  }

  setUnauthorizedHandler(clear)

  return { user, status, isAuthenticated, isAdmin, isDeactivated, bootstrap, login, logout, clear }
})
