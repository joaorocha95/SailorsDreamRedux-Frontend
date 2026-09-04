<script setup lang="ts">
import { RouterLink } from 'vue-router'

/**
 * The catch-all, matched by `/:pathMatch(.*)*` and therefore last in the route table.
 *
 * It carries no logic at all, which is the point: it is reached when the router has already
 * failed to match, so there is nothing left to look up and nothing that could fail a second time.
 *
 * The copy does one job beyond apologising. A withdrawn listing is soft-deleted rather than
 * removed — the row survives so that negotiations about the boat stay readable — so `/listings/9`
 * for a withdrawn boat is a real 404 from the API rather than a URL that never existed. Saying so
 * here means somebody following an old link from a friend learns which of the two happened.
 * (`ListingView` has its own, warmer version of this for the case where it already knows the
 * listing was withdrawn.)
 */
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
/* Deliberately taller than the page gutter: an error page with content jammed under the header
   reads as a broken layout on top of a broken link. */
.wrap {
  padding: clamp(3rem, 9vw, 6rem) 0 var(--sp-8);
  display: grid;
  gap: var(--sp-4);
  justify-items: start;
}
/* The display face and `--step-3`, the same as every other page title. An error is still a page,
   and demoting its heading would make the app look like it had fallen out of its own design. */
h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}
p {
  color: var(--ink-soft);
  max-width: var(--measure);
}
/* The same uppercase back-link treatment the listing and thread pages use, so the way out of a
   dead end looks like the way out of anywhere else. */
.back {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
</style>
