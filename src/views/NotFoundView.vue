<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="page wrap">
    <h1>Not found</h1>
    <p>
      That page doesn’t exist. A listing that has been withdrawn will also land here — the row
      survives so past conversations stay readable, but it is no longer browsable.
    </p>
    <RouterLink :to="{ name: 'browse' }" class="back">Back to browse</RouterLink>
  </div>
</template>

<style scoped>
.wrap {
  padding: clamp(3rem, 9vw, 6rem) 0 var(--sp-8);
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
