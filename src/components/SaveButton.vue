<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useWishlistStore } from '@/stores/wishlist'
import type { ProductResponse } from '@/types/api'

/**
 * Saving a listing, from a browse card or from the listing itself.
 *
 * The state lives in the wishlist store rather than here, because the answer is the same one for
 * every card on the page and asking per card would be twenty requests for one list. `GET /wishlist`
 * is unpaged, so one request answers all of them.
 *
 * A guest gets a link to sign in rather than a control that fails. Saving is the whole point of
 * having an account for someone who is not selling, so this is a reasonable place to ask.
 */

const props = defineProps<{
  listing: ProductResponse
  /** The card variant sits over a photograph and carries no label. */
  compact?: boolean
}>()

const route = useRoute()
const auth = useAuthStore()
const wishlist = useWishlistStore()

const busy = ref(false)

const saved = computed(() => wishlist.isSaved(props.listing.id))
const label = computed(() => (saved.value ? 'Saved' : 'Save'))

async function toggle() {
  if (busy.value) return
  busy.value = true
  try {
    await wishlist.toggle(props.listing)
  } catch {
    // The store already rolled the optimistic change back and holds the message. A save control
    // is not the place for an error banner; the button simply returns to what it was.
  } finally {
    busy.value = false
  }
}

// Cheap for every card past the first: the store shares one in-flight request and then answers
// from memory.
onMounted(() => {
  if (auth.isAuthenticated) void wishlist.ensureLoaded()
})
</script>

<template>
  <RouterLink
    v-if="!auth.isAuthenticated"
    class="save"
    :class="{ compact }"
    :to="{ name: 'login', query: { redirect: route.fullPath } }"
    :title="compact ? 'Sign in to save this listing' : undefined"
  >
    <span class="mark" aria-hidden="true">☆</span>
    <span :class="compact ? 'sr-only' : 'text'">Sign in to save</span>
  </RouterLink>

  <button
    v-else
    type="button"
    class="save"
    :class="{ compact, on: saved }"
    :disabled="busy"
    :aria-pressed="saved"
    @click="toggle"
  >
    <span class="mark" aria-hidden="true">{{ saved ? '★' : '☆' }}</span>
    <span :class="compact ? 'sr-only' : 'text'">{{ label }}</span>
    <span v-if="compact" class="sr-only"> {{ listing.name }}</span>
  </button>
</template>

<style scoped>
.save {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--step--1);
  background: none;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.34rem 0.85rem;
  color: var(--ink-soft);
  text-decoration: none;
  cursor: pointer;
  transition:
    transform var(--d-press) var(--ease-out),
    border-color var(--d-pop) var(--ease-out),
    color var(--d-pop) var(--ease-out);
}
.save:active {
  transform: scale(0.97);
}
.save:disabled {
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .save:hover {
    color: var(--ink);
    border-color: var(--ink-faint);
  }
}

.save.on {
  color: var(--ink);
  border-color: var(--ink-faint);
}

/* On a card it sits over the photograph, so it needs its own ground rather than a border that
   would disappear into whatever the image happens to be behind it. */
.save.compact {
  padding: 0;
  width: 2rem;
  height: 2rem;
  justify-content: center;
  border-color: transparent;
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.mark {
  /* The filled and hollow stars are different widths in most faces, so the box is fixed to stop
     the label shifting sideways when the state changes. */
  display: inline-block;
  width: 1em;
  text-align: center;
  font-size: 1.05em;
  line-height: 1;
}

.text {
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
