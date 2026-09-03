<script setup lang="ts">
import { computed, ref } from 'vue'

import { activeCount, emptyFilters, type BrowseFilters } from '@/lib/browse-filters'
import type { CategoryResponse, ListingType } from '@/types/api'

/**
 * The browse filters, behind a disclosure.
 *
 * A disclosure rather than a permanent sidebar because the catalogue is photographic: a column
 * of controls down the side would take roughly a third of the width the images are the point of.
 * Closed by default, and the button carries the count so a narrowed catalogue never looks like an
 * empty one.
 *
 * On a small screen this is the whole story for now. The roadmap's mobile drawer replaces the
 * presentation, not the state — this panel's model is what it will drive.
 */

const filters = defineModel<BrowseFilters>({ required: true })

defineProps<{
  /** Empty until `GET /categories` answers. The control hides rather than offering nothing. */
  categories: CategoryResponse[]
}>()

const open = ref(false)
const active = computed(() => activeCount(filters.value))

/**
 * `FOR_SALE` and `FOR_RENT` both match a listing typed `BOTH`; `BOTH` matches only `BOTH`. That
 * asymmetry is deliberate server-side — someone browsing rentals wants to see a boat its owner
 * will either sell or rent — and it is surprising enough to say out loud under the control.
 */
const LISTING_TYPES: readonly { value: ListingType; label: string }[] = [
  { value: 'FOR_SALE', label: 'For sale' },
  { value: 'FOR_RENT', label: 'For rent' },
  { value: 'BOTH', label: 'Offered both ways' },
]

function clear() {
  filters.value = emptyFilters()
}
</script>

<template>
  <section class="filters">
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
    <div v-show="open" id="filter-fields" class="fields">
      <p class="field">
        <label for="f-name">Name</label>
        <input id="f-name" v-model="filters.name" type="search" placeholder="Any" />
      </p>

      <p v-if="categories.length > 0" class="field">
        <label for="f-category">Category</label>
        <select id="f-category" v-model="filters.categoryId">
          <option value="">Any</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </p>

      <p class="field">
        <label for="f-type">Offering</label>
        <select id="f-type" v-model="filters.listingType">
          <option value="">Any</option>
          <option v-for="type in LISTING_TYPES" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
        </select>
        <span class="hint">Sale and rent each include boats offered both ways.</span>
      </p>

      <fieldset class="field range">
        <legend>Sale price</legend>
        <label class="sr-only" for="f-min-price">Lowest sale price</label>
        <input
          id="f-min-price"
          v-model="filters.minPrice"
          type="number"
          min="0"
          placeholder="No min"
        />
        <span aria-hidden="true">–</span>
        <label class="sr-only" for="f-max-price">Highest sale price</label>
        <input
          id="f-max-price"
          v-model="filters.maxPrice"
          type="number"
          min="0"
          placeholder="No max"
        />
      </fieldset>

      <fieldset class="field range">
        <legend>Day rate</legend>
        <label class="sr-only" for="f-min-rate">Lowest day rate</label>
        <input
          id="f-min-rate"
          v-model="filters.minPricePerDay"
          type="number"
          min="0"
          placeholder="No min"
        />
        <span aria-hidden="true">–</span>
        <label class="sr-only" for="f-max-rate">Highest day rate</label>
        <input
          id="f-max-rate"
          v-model="filters.maxPricePerDay"
          type="number"
          min="0"
          placeholder="No max"
        />
      </fieldset>
    </div>
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
.clear:focus-visible {
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
   beside it. auto-fit means the same markup is one column on a phone and four on a desktop. */
.fields {
  flex: 1 1 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--sp-4) var(--sp-5);
  padding: var(--sp-3) 0 var(--sp-2);
}

.field {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
  border: 0;
  padding: 0;
  font-size: var(--step--1);
}
.field > label,
.field legend {
  color: var(--ink-faint);
  padding: 0;
}

.range {
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  column-gap: var(--sp-2);
}
.range legend {
  grid-column: 1 / -1;
}
.range span {
  color: var(--ink-faint);
}

.hint {
  color: var(--ink-faint);
  font-size: 0.72rem;
  line-height: 1.35;
}

input,
select {
  font: inherit;
  font-size: var(--step--1);
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--rule);
  border-radius: 0;
  padding: var(--sp-1) 0;
  min-width: 0;
  transition: border-color var(--d-press) var(--ease-out);
}
input::placeholder {
  color: var(--ink-faint);
}
select {
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  input:hover,
  select:hover {
    border-color: var(--ink-faint);
  }
}
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
