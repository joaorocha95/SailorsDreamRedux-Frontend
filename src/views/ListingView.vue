<script setup lang="ts">
import { RouterLink } from 'vue-router'

/**
 * Listing detail — Phase 1.
 *
 * A stub rather than an empty file so the route resolves and the shell is navigable end to end.
 * When it lands it uses the *detail* response shape, which carries the full ordered `imageUrls`
 * (`[]` when the listing has no photographs, never null).
 */
defineProps<{ id: string }>()
</script>

<template>
  <div class="page wrap">
    <h1>Listing {{ id }}</h1>
    <p>The detail view arrives in Phase 1, with the gallery and the “Message the owner” action.</p>
    <RouterLink :to="{ name: 'browse' }" class="back">Back to browse</RouterLink>
  </div>
</template>

<style scoped>
.wrap {
  padding: clamp(2.5rem, 7vw, 5rem) 0 var(--sp-8);
  display: grid;
  gap: var(--sp-4);
  justify-items: start;
}
h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}
p {
  color: var(--ink-soft);
  max-width: var(--measure);
}
.back {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
</style>
