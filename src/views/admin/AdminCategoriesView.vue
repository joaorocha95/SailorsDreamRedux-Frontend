<script setup lang="ts">
import { onMounted, ref } from 'vue'

import AdminNav from '@/components/AdminNav.vue'
import { ApiError, api } from '@/lib/http'
import type { CategoryResponse, CreateCategoryRequest, UpdateCategoryRequest } from '@/types/api'

/**
 * The controlled vocabulary every listing is filed under.
 *
 * Small and consequential. A category is one mutable field, but it is the field a browse filter is
 * built from, so the two things worth getting right here are both about what a change does to the
 * listings underneath it:
 *
 *  - **Deleting unfiles, it does not delete.** The server clears `category_id` on every product
 *    pointing here — including soft-deleted ones, since the foreign key outlives them — and then
 *    removes the row. The listings survive with `categoryId: null`, which browse already treats as
 *    a normal state rather than an error.
 *  - **Names collide case-insensitively.** "yachts" is refused while "Yachts" exists, and rightly:
 *    two filter entries that read the same would split the listings between them. A **409**, since
 *    the request is well-formed and what rules it out is state the caller could not have known.
 */

const categories = ref<CategoryResponse[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

const newName = ref('')
const creating = ref(false)
const createError = ref('')

/** Which row is being renamed, and the draft for it. One at a time — this is a list, not a form. */
const editingId = ref<number | null>(null)
const draftName = ref('')
const confirmingDelete = ref<number | null>(null)
const working = ref<number | null>(null)
const rowError = ref('')

async function load() {
  state.value = 'loading'
  rowError.value = ''

  try {
    categories.value = await api.get<CategoryResponse[]>('/categories')
    state.value = 'ready'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

async function create() {
  const name = newName.value.trim()
  if (name === '' || creating.value) return

  creating.value = true
  createError.value = ''

  try {
    const body: CreateCategoryRequest = { name }
    const created = await api.post<CategoryResponse>('/categories', body)
    categories.value = [...categories.value, created]
    newName.value = ''
  } catch (error) {
    // A 409 is the duplicate, and its `detail` names the category — worth showing as written.
    createError.value =
      error instanceof ApiError ? error.message : 'Could not add that category just now.'
  } finally {
    creating.value = false
  }
}

function startRename(category: CategoryResponse) {
  editingId.value = category.id
  draftName.value = category.name
  rowError.value = ''
}

async function rename(category: CategoryResponse) {
  const name = draftName.value.trim()
  // Unlike every other PATCH here, `name` is required rather than "null means leave unchanged" —
  // a category has one mutable field, so an empty request asks for nothing.
  if (name === '' || working.value !== null) return
  if (name === category.name) {
    editingId.value = null
    return
  }

  working.value = category.id
  rowError.value = ''

  try {
    const body: UpdateCategoryRequest = { name }
    const updated = await api.patch<CategoryResponse>(`/categories/${category.id}`, body)
    categories.value = categories.value.map((item) => (item.id === updated.id ? updated : item))
    editingId.value = null
  } catch (error) {
    rowError.value = error instanceof ApiError ? error.message : 'Could not rename that category.'
  } finally {
    working.value = null
  }
}

async function remove(category: CategoryResponse) {
  working.value = category.id
  rowError.value = ''

  try {
    await api.delete<void>(`/categories/${category.id}`)
    categories.value = categories.value.filter((item) => item.id !== category.id)
    confirmingDelete.value = null
  } catch (error) {
    rowError.value = error instanceof ApiError ? error.message : 'Could not delete that category.'
  } finally {
    working.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page admin">
    <AdminNav />

    <h1>Categories</h1>
    <p class="lede">
      Every listing is filed under one of these, and browse filters on them. Deleting a category
      does not delete its listings — they become unfiled, and stay findable by everything except the
      category filter.
    </p>

    <p v-if="state === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <form class="add" @submit.prevent="create">
        <label class="sr-only" for="new-category">New category name</label>
        <input
          id="new-category"
          v-model="newName"
          type="text"
          maxlength="100"
          placeholder="New category"
          :disabled="creating"
        />
        <button type="submit" class="primary" :disabled="creating || newName.trim() === ''">
          {{ creating ? 'Adding…' : 'Add' }}
        </button>
      </form>
      <p v-if="createError" class="row-error" role="alert">{{ createError }}</p>

      <p v-if="categories.length === 0" class="empty">
        No categories yet. Nothing can be listed until there is at least one.
      </p>

      <p v-if="rowError" class="row-error" role="alert">{{ rowError }}</p>

      <ul v-if="categories.length" class="rows">
        <li v-for="category in categories" :key="category.id">
          <template v-if="editingId === category.id">
            <label class="sr-only" :for="`rename-${category.id}`">Rename {{ category.name }}</label>
            <input
              :id="`rename-${category.id}`"
              v-model="draftName"
              type="text"
              maxlength="100"
              @keydown.enter.prevent="rename(category)"
              @keydown.esc="editingId = null"
            />
            <div class="actions">
              <button
                type="button"
                class="primary"
                :disabled="working === category.id"
                @click="rename(category)"
              >
                Save
              </button>
              <button type="button" @click="editingId = null">Cancel</button>
            </div>
          </template>

          <template v-else>
            <span class="name">{{ category.name }}</span>

            <div class="actions">
              <button type="button" @click="startRename(category)">Rename</button>

              <!-- Two presses, and the second one says what happens to the listings. Nothing is
                   lost, but "delete" beside a category people have filed boats under deserves to
                   be specific about that. -->
              <template v-if="confirmingDelete === category.id">
                <button
                  type="button"
                  class="danger"
                  :disabled="working === category.id"
                  @click="remove(category)"
                >
                  Delete and unfile its listings
                </button>
                <button type="button" @click="confirmingDelete = null">Keep</button>
              </template>
              <button v-else type="button" @click="confirmingDelete = category.id">Delete</button>
            </div>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
@import './admin.css';

.lede {
  max-width: var(--measure);
  margin: var(--sp-2) 0 var(--sp-5);
  color: var(--ink-soft);
  font-size: var(--step--1);
}

.add {
  display: flex;
  gap: var(--sp-3);
  margin-bottom: var(--sp-5);
}
.add input,
.rows input {
  flex: 1;
  max-width: 22rem;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
}

.rows li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--rule-soft);
}

.name {
  font-family: var(--font-display);
  font-size: var(--step-1);
}

/* Only the confirming press is coloured. The first one just asks a question. */
.actions button.danger {
  border-color: var(--critical);
  color: var(--critical);
}
</style>
