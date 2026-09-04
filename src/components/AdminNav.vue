<script setup lang="ts">
import { RouterLink } from 'vue-router'

/**
 * The staff pages, and the line that says you are on one.
 *
 * Deliberately plain. These are three unrelated jobs — a moderation queue, a controlled
 * vocabulary, and a user directory — that share an audience and nothing else, so they are three
 * pages with a strip between them rather than a dashboard pretending they are one thing.
 */
</script>

<template>
  <nav class="admin-nav" aria-label="Staff">
    <span class="tag">Staff</span>
    <RouterLink :to="{ name: 'admin-reports' }">Reports</RouterLink>
    <RouterLink :to="{ name: 'admin-categories' }">Categories</RouterLink>
    <RouterLink :to="{ name: 'admin-users' }">Users</RouterLink>
  </nav>
</template>

<style scoped>
.admin-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-4);
  padding-bottom: var(--sp-4);
  margin-bottom: var(--sp-5);
  border-bottom: 1px solid var(--rule);
  font-size: var(--step--1);
}

/* Caution rather than ink: these pages act on other people's accounts, and a standing reminder of
   which side of the app you are on is worth one word. */
.tag {
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--caution);
}

.admin-nav a {
  color: var(--ink-soft);
  text-decoration: none;
  padding-bottom: 2px;
  border-bottom: 1px solid transparent;
}
.admin-nav a.router-link-active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}
@media (hover: hover) and (pointer: fine) {
  .admin-nav a:hover {
    color: var(--ink);
  }
}
</style>
