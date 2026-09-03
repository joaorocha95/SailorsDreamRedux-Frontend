<script setup lang="ts">
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from 'vaul-vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import FilterFields from '@/components/FilterFields.vue'
import { activeCount, emptyFilters, type BrowseFilters } from '@/lib/browse-filters'
import type { CategoryResponse } from '@/types/api'

/**
 * The browse filters, in whichever container the screen can afford.
 *
 * Wide: a disclosure under the hero. Not a permanent sidebar — the catalogue is photographic and
 * a column of controls down the side would take roughly a third of the width the images are the
 * point of.
 *
 * Narrow: a drawer, because five fields opening inline push the entire catalogue off the screen,
 * and the visitor loses sight of the thing the filters are meant to be changing.
 *
 * Both drive the same `FilterFields`, so only the container differs.
 */

const filters = defineModel<BrowseFilters>({ required: true })

defineProps<{
  categories: CategoryResponse[]
}>()

const open = ref(false)
const active = computed(() => activeCount(filters.value))

/**
 * Which container to use. A media query rather than a user-agent guess, and the same 720px the
 * catalogue grid uses to go two-up — the point at which the fields stop crowding the boats out.
 */
const wide = ref(true)
let query: MediaQueryList | null = null

function syncWidth(event: MediaQueryList | MediaQueryListEvent) {
  wide.value = event.matches
  // Leaving one container should not strand the other holding it open.
  open.value = false
}

onMounted(() => {
  query = window.matchMedia('(min-width: 720px)')
  syncWidth(query)
  query.addEventListener('change', syncWidth)
})

onBeforeUnmount(() => query?.removeEventListener('change', syncWidth))

function clear() {
  filters.value = emptyFilters()
}
</script>

<template>
  <section class="filters">
    <template v-if="wide">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open"
        aria-controls="filter-fields"
        @click="open = !open"
      >
        Filters<span v-if="active" class="badge">{{ active }}</span>
      </button>

      <button v-if="active" type="button" class="clear" @click="clear">Clear</button>

      <!-- v-show, not v-if: closing the panel should not throw away what was typed in it. -->
      <div v-show="open" id="filter-fields" class="inline-fields">
        <FilterFields v-model="filters" :categories="categories" />
      </div>
    </template>

    <template v-else>
      <DrawerRoot v-model:open="open">
        <DrawerTrigger as-child>
          <button type="button" class="toggle">
            Filters<span v-if="active" class="badge">{{ active }}</span>
          </button>
        </DrawerTrigger>

        <DrawerPortal>
          <DrawerOverlay class="overlay" />
          <DrawerContent class="sheet" aria-describedby="drawer-note">
            <!-- The drag handle. Decorative: the sheet is closable by the button below, by the
                 overlay, and by Escape, so this is an affordance rather than the only way out. -->
            <div class="grabber" aria-hidden="true"></div>

            <DrawerTitle class="sheet-title">Filters</DrawerTitle>
            <DrawerDescription id="drawer-note" class="sheet-note">
              The catalogue updates as you change these.
            </DrawerDescription>

            <div class="sheet-body">
              <FilterFields v-model="filters" :categories="categories" />
            </div>

            <div class="sheet-actions">
              <button v-if="active" type="button" class="clear" @click="clear">Clear</button>
              <DrawerClose as-child>
                <button type="button" class="done">Show results</button>
              </DrawerClose>
            </div>
          </DrawerContent>
        </DrawerPortal>
      </DrawerRoot>

      <button v-if="active" type="button" class="clear" @click="clear">Clear</button>
    </template>
  </section>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-3) var(--sp-4);
}

.toggle,
.clear {
  font: inherit;
  font-size: var(--step--1);
  background: none;
  border: 0;
  padding: 0;
  color: var(--ink-soft);
  cursor: pointer;
  transition: color var(--d-press) var(--ease-out);
}
.toggle {
  color: var(--ink);
  display: inline-flex;
  align-items: baseline;
  gap: var(--sp-2);
}
.toggle:active,
.clear:active {
  transform: scale(0.97);
}
.toggle:focus-visible,
.clear:focus-visible,
.done:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
@media (hover: hover) and (pointer: fine) {
  .clear:hover {
    color: var(--ink);
  }
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1;
  padding: 0.2em 0.45em;
  border-radius: 2px;
  background: var(--ink);
  color: var(--ground);
}

/* Takes the whole row, so the fields open underneath the toggle rather than in a narrow column
   beside it. */
.inline-fields {
  flex: 1 1 100%;
  padding: var(--sp-3) 0 var(--sp-2);
}

/* --- The drawer ------------------------------------------------------------------------- */

.overlay {
  position: fixed;
  inset: 0;
  background: rgb(8 19 31 / 45%);
}

.sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 10;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-5) var(--sp-6);
  background: var(--surface);
  border-top: 1px solid var(--rule);
  border-radius: 12px 12px 0 0;
  /* The one place --ease-drawer is used. vaul drives the transform while a drag is in flight
     and hands it back on release; this is the curve it settles on. */
  transition: transform var(--d-overlay) var(--ease-drawer);
}

.grabber {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--rule);
  margin: 0 auto var(--sp-2);
}

.sheet-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-2);
  color: var(--ink);
}
.sheet-note {
  font-size: 0.72rem;
  color: var(--ink-faint);
  margin-bottom: var(--sp-3);
}

.sheet-body {
  overflow-y: auto;
  padding-bottom: var(--sp-4);
}

.sheet-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--rule-soft);
}

.done {
  font: inherit;
  font-size: var(--step--1);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.55rem 1.1rem;
  cursor: pointer;
  margin-left: auto;
  transition: transform var(--d-press) var(--ease-out);
}
.done:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    transition-duration: 120ms;
  }
}
</style>
