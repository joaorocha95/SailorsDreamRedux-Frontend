<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth'

/**
 * The masthead, on every page including the error ones.
 *
 * It is the only component that reads the session directly rather than being told about it, and
 * that is deliberate: the nav *is* a picture of who you are, so it should change the instant the
 * store does. `storeToRefs` is what preserves that — destructuring a Pinia store plainly would
 * copy the values out and the header would be frozen at whatever the session was when it mounted.
 *
 * `auth` itself is kept undestructured for `auth.logout()`, because actions do not need
 * unwrapping and `storeToRefs` deliberately does not return them.
 *
 * There is no unread badge on Messages, and that is a decision rather than an omission: a count
 * in the masthead would need its own poller running on every page in the app, where the inbox and
 * the thread each already poll only while they are open.
 */
const auth = useAuthStore()
const { isAdmin, isAuthenticated, user } = storeToRefs(auth)
</script>

<template>
  <header class="header">
    <div class="page inner">
      <RouterLink :to="{ name: 'browse' }" class="mark">Sailor's Dream</RouterLink>

      <!-- Named, because a page can hold several navigations — the admin strip is another — and
           "Main" is what tells them apart in a screen reader's landmark list. -->
      <nav class="links" aria-label="Main">
        <RouterLink :to="{ name: 'browse' }">Browse</RouterLink>
        <!-- Hidden rather than disabled for a guest. Every one of these routes is behind
             `requiresAuth`, so showing them would be offering four links that bounce to the login
             form — and the two buttons on the right already say what to do about that. -->
        <template v-if="isAuthenticated">
          <RouterLink :to="{ name: 'selling' }">Selling</RouterLink>
          <RouterLink :to="{ name: 'inbox' }">Messages</RouterLink>
          <RouterLink :to="{ name: 'saved' }">Saved</RouterLink>
          <RouterLink v-if="isAdmin" :to="{ name: 'admin-reports' }" class="staff"
            >Staff</RouterLink
          >
        </template>
      </nav>

      <div class="account">
        <template v-if="isAuthenticated">
          <!-- The name is the way into the account. People look for their own name first, and a
               separate "Account" link beside it would be two words for one destination. -->
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

/* `.page` supplies the max-width and the horizontal gutter; this only adds the vertical rhythm
   and the row layout, so the masthead lines up with the content under it on every page. */
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

/* `margin-left: auto` pushes the nav and everything after it to the right, which is what leaves
   the wordmark alone on the left without needing a spacer element between them. */
.links {
  display: flex;
  gap: var(--sp-5);
  margin-left: auto;
}

.links a {
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

/* Marked apart from the rest of the navigation: the pages behind it act on other people's
   accounts, and knowing you are one click from that is worth a colour. */
.links a.staff {
  color: var(--caution);
}

/* Gated: on a touch device a tap fires :hover, so an ungated hover style sticks after the tap. */
@media (hover: hover) and (pointer: fine) {
  .links a:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
}

/* `router-link-active` matches on prefix, so /messages/1 keeps Messages lit while you are reading
   a thread — which is the behaviour you want, since a thread *is* somewhere inside Messages. */
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

/* Below this the five nav items and the account block cannot share a row without wrapping into
   something worse than either. The nav goes rather than the account block: signing out and
   reaching your own account are the two things you cannot get to any other way, where every nav
   destination is also reachable from the page you are on. */
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
