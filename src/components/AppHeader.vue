<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { isAuthenticated, user } = storeToRefs(auth)
</script>

<template>
  <header class="header">
    <div class="page inner">
      <RouterLink :to="{ name: 'browse' }" class="mark">Sailor's Dream</RouterLink>

      <nav class="links" aria-label="Main">
        <RouterLink :to="{ name: 'browse' }">Browse</RouterLink>
        <template v-if="isAuthenticated">
          <RouterLink :to="{ name: 'selling' }">Selling</RouterLink>
          <RouterLink :to="{ name: 'inbox' }">Messages</RouterLink>
          <!-- Arriving in a later phase; rendered now so the shell is honest about its shape. -->
          <span class="pending" aria-disabled="true">Saved</span>
        </template>
      </nav>

      <div class="account">
        <template v-if="isAuthenticated">
          <RouterLink :to="{ name: 'account' }" class="who">{{ user?.name }}</RouterLink>
          <button type="button" class="link-btn" @click="auth.logout()">Sign out</button>
        </template>
        <template v-else>
          <RouterLink :to="{ name: 'signup' }" class="signup">Sign up</RouterLink>
          <RouterLink :to="{ name: 'login' }" class="signin">Sign in</RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  border-bottom: 1px solid var(--rule);
  background: var(--ground);
}

.inner {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  padding-top: var(--sp-4);
  padding-bottom: var(--sp-4);
}

.mark {
  font-family: var(--font-display);
  font-size: var(--step-1);
  letter-spacing: -0.015em;
  text-decoration: none;
  white-space: nowrap;
}

.links {
  display: flex;
  gap: var(--sp-5);
  margin-left: auto;
}

.links a,
.pending {
  font-size: var(--step--1);
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
  padding-bottom: 2px;
  border-bottom: 1px solid transparent;
  transition:
    color var(--d-pop) var(--ease-out),
    border-color var(--d-pop) var(--ease-out);
}

.pending {
  color: var(--ink-faint);
  cursor: default;
}

/* Gated: on a touch device a tap fires :hover, so an ungated hover style sticks after the tap. */
@media (hover: hover) and (pointer: fine) {
  .links a:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
}

.links a.router-link-active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.account {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--step--1);
}

/* The name is the way into the account, which is where people look for it. */
.who {
  color: var(--ink-soft);
  text-decoration: none;
  transition: color var(--d-press) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .who:hover {
    color: var(--ink);
  }
}

/* Plain text beside the outlined Sign in: signing up is the less common intent of the two, and
   two pills competing for the same corner would give neither of them a hierarchy. */
.signup {
  letter-spacing: 0.11em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink-soft);
  transition: color var(--d-press) var(--ease-out);
}
.signup:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .signup:hover {
    color: var(--ink);
  }
}

.signin {
  letter-spacing: 0.11em;
  text-transform: uppercase;
  text-decoration: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.34rem 0.85rem;
  color: var(--ink-soft);
  transition:
    transform var(--d-press) var(--ease-out),
    border-color var(--d-pop) var(--ease-out),
    color var(--d-pop) var(--ease-out);
}
.signin:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .signin:hover {
    color: var(--ink);
    border-color: var(--ink-faint);
  }
}

.link-btn {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--ink-soft);
  text-decoration: underline;
}
@media (hover: hover) and (pointer: fine) {
  .link-btn:hover {
    color: var(--ink);
  }
}

@media (max-width: 640px) {
  .links {
    display: none;
  }
  .inner {
    justify-content: space-between;
  }
  .account {
    margin-left: auto;
  }
}
</style>
