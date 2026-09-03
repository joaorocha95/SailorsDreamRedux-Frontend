<script setup lang="ts">
import { computed } from 'vue'

import { rangeProblems, type BrowseFilters } from '@/lib/browse-filters'
import type { CategoryResponse, ListingType } from '@/types/api'

/**
 * The filter controls themselves, with no opinion about where they are shown.
 *
 * Extracted so the inline disclosure on a wide screen and the drawer on a narrow one are the
 * same fields rather than two copies that drift. Only the presentation differs; the model, the
 * labels and the validation are shared.
 */

const filters = defineModel<BrowseFilters>({ required: true })

defineProps<{
  /** Empty until `GET /categories` answers. The control hides rather than offering nothing. */
  categories: CategoryResponse[]
}>()

/** A minimum above its maximum. Said here rather than answered with an empty catalogue. */
const problems = computed(() => rangeProblems(filters.value))

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
</script>

<template>
  <div class="fields">
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
      <p v-if="problems.salePrice" class="problem" role="alert">
        The lowest price is above the highest.
      </p>
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
      <p v-if="problems.dayRate" class="problem" role="alert">
        The lowest rate is above the highest.
      </p>
    </fieldset>
  </div>
</template>

<style scoped>
/* auto-fit means the same markup is one column in the drawer and four across a desktop. */
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--sp-4) var(--sp-5);
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

.problem {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--critical);
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
