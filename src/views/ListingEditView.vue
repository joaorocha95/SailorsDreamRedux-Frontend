<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { imageRejection } from '@/lib/image-upload'
import {
  clearedByChangingTypeTo,
  emptyListingForm,
  formFrom,
  hasProblems,
  isUnchanged,
  listingProblems,
  toCreateBody,
  toUpdateBody,
  usesDayRate,
  usesSalePrice,
} from '@/lib/listing-form'
import { useRetryAfter } from '@/lib/retry-after'
import { useAuthStore } from '@/stores/auth'
import type {
  CategoryResponse,
  ListingType,
  ProductImageResponse,
  ProductResponse,
} from '@/types/api'

/**
 * Writing a listing — the same component for a new one and an existing one.
 *
 * The order of operations is the server's, not a choice made here. A listing is created
 * **inactive**, and photographs are a sub-resource of a listing that already exists
 * (`POST /products/{id}/images`), so there is no version of this page that takes a boat and eight
 * pictures in one submission. Writing it, illustrating it and publishing it are three steps, and
 * the page says so rather than pretending otherwise.
 *
 * Two things the API cannot currently do, stated here so the gaps are not mistaken for oversights:
 *
 *  - **Photographs cannot be reordered.** Position is assigned on append and there is no endpoint
 *    that changes it. Position 0 is the primary image, so the first one uploaded is the cover.
 *  - **A photograph can only be deleted if this page uploaded it.** Deletion needs an image id,
 *    ids come back only from the upload response, and there is no `GET /products/{id}/images` —
 *    the gallery arrives as bare URLs. So a picture added in an earlier session can be seen and
 *    not named.
 */

const props = defineProps<{ id?: string }>()

const router = useRouter()
const auth = useAuthStore()

const { secondsLeft: saveWait, start: startSaveWait } = useRetryAfter()
const { secondsLeft: uploadWait, start: startUploadWait } = useRetryAfter()

/** The server's cap. The ninth upload is a 409, so the picker closes at the eighth. */
const MAX_IMAGES = 8

const isNew = computed(() => props.id === undefined)

const form = ref(emptyListingForm())
const original = ref<ProductResponse | null>(null)
const categories = ref<CategoryResponse[]>([])

const state = ref<'loading' | 'ready' | 'missing' | 'forbidden' | 'error'>('loading')
const errorMessage = ref('')

const saving = ref(false)
const saveError = ref('')
const saved = ref(false)
/** Set right after a create, so the new listing arrives explaining what is left to do. */
const justCreated = ref(false)

const publishing = ref(false)
const publishError = ref('')

/**
 * Photographs already on the listing when this page loaded. URLs only — see the note above.
 * Deliberately set in `load` alone: adopting the `imageUrls` off a later PATCH response would
 * count everything uploaded since twice.
 */
const existingImages = ref<string[]>([])
/** Uploaded in this session, so they carry the id a delete needs. */
const addedImages = ref<ProductImageResponse[]>([])

const uploading = ref(false)
const imageError = ref('')

const imageCount = computed(() => existingImages.value.length + addedImages.value.length)
const atImageLimit = computed(() => imageCount.value >= MAX_IMAGES)

/** Named the moment the type changes, so the seller sees which figure is being dropped. */
const clearedField = ref<'price' | 'pricePerDay' | null>(null)

const problems = computed(() => listingProblems(form.value))
/** Errors appear on submit, not while typing — a form that argues mid-sentence is exhausting. */
const showProblems = ref(false)

const TYPE_OPTIONS: { value: ListingType; label: string }[] = [
  { value: 'FOR_SALE', label: 'For sale' },
  { value: 'FOR_RENT', label: 'For rent' },
  { value: 'BOTH', label: 'For sale or rent' },
]

const CLEARED_LABEL = { price: 'sale price', pricePerDay: 'day rate' } as const

/**
 * Changing what the listing offers, and clearing the price that no longer applies.
 *
 * The clearing is the server's behaviour — on a PATCH null means "leave unchanged", so the only
 * way a stale price can go is for the server to drop it — but doing it visibly here is the point.
 * The seller typed that number; watching the field leave is what explains why the listing stops
 * carrying it.
 */
function chooseType(next: ListingType | '') {
  const dropped = clearedByChangingTypeTo(form.value, next)
  form.value.listingType = next
  if (dropped) {
    form.value[dropped] = ''
    clearedField.value = dropped
  } else {
    clearedField.value = null
  }
}

/**
 * The category vocabulary. Unlike browse, a failure here is not quiet: a category is required to
 * create a listing at all, so an empty list is a dead end that has to say why.
 *
 * Reports success rather than setting the state itself, so the caller keeps the one place that
 * decides what this page is showing.
 */
async function loadCategories(): Promise<boolean> {
  try {
    categories.value = await api.get<CategoryResponse[]>('/categories')
    return true
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Could not load the list of categories.'
    return false
  }
}

async function load() {
  state.value = 'loading'
  saveError.value = ''
  saved.value = false
  showProblems.value = false
  clearedField.value = null
  addedImages.value = []

  if (!(await loadCategories())) {
    state.value = 'error'
    return
  }

  if (isNew.value) {
    form.value = emptyListingForm()
    original.value = null
    existingImages.value = []
    state.value = 'ready'
    return
  }

  try {
    const found = await api.get<ProductResponse>(`/products/${props.id}`)
    // The read path is public, so getting the listing proves nothing about who owns it. Editing
    // somebody else's is a 403 on the way out; saying so now beats letting them write a
    // description first.
    if (auth.user?.id !== found.sellerId) {
      state.value = 'forbidden'
      return
    }
    original.value = found
    form.value = formFrom(found)
    existingImages.value = found.imageUrls ?? []
    state.value = 'ready'
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      state.value = 'missing'
      return
    }
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the API. Is the backend running on port 8080?'
    state.value = 'error'
  }
}

async function save() {
  showProblems.value = true
  if (hasProblems(problems.value) || saving.value || saveWait.value > 0) return

  saving.value = true
  saveError.value = ''
  saved.value = false

  try {
    if (original.value === null) {
      const created = await api.post<ProductResponse>('/products', toCreateBody(form.value))
      original.value = created
      existingImages.value = created.imageUrls ?? []
      // Photographs need a listing to hang from, so the page becomes the edit page for the boat
      // that now exists. `replace`, not `push`: going back to a create form that has already been
      // submitted would invite a second listing.
      await router.replace({ name: 'listing-edit', params: { id: String(created.id) } })
      justCreated.value = true
      return
    }

    const body = toUpdateBody(form.value, original.value)
    if (isUnchanged(body)) {
      saved.value = true
      return
    }

    const updated = await api.patch<ProductResponse>(`/products/${original.value.id}`, body)
    // Everything except the gallery: `existingImages` is owned by `load`, and taking the fresh
    // `imageUrls` here would list this session's uploads a second time.
    original.value = updated
    form.value = formFrom(updated)
    clearedField.value = null
    saved.value = true
  } catch (error) {
    if (error instanceof ApiError) {
      startSaveWait(error.retryAfterSeconds)
      // The price rules are cross-field, so a 400 here names the combination rather than a
      // control — which is exactly why `detail` is shown instead of being mapped onto a field.
      saveError.value = error.message
    } else {
      saveError.value = 'Could not save. Check your connection and try again.'
    }
  } finally {
    saving.value = false
  }
}

async function publish() {
  if (!original.value) return

  publishing.value = true
  publishError.value = ''

  try {
    original.value = await api.patch<ProductResponse>(`/products/${original.value.id}/activate`)
  } catch (error) {
    publishError.value =
      error instanceof ApiError ? error.message : 'Could not publish just now. Try again shortly.'
  } finally {
    publishing.value = false
  }
}

async function addPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !original.value) return

  imageError.value = ''

  const rejection = imageRejection(file)
  if (rejection) {
    imageError.value = rejection
    input.value = ''
    return
  }

  uploading.value = true
  try {
    const image = await api.upload<ProductImageResponse>(
      `/products/${original.value.id}/images`,
      file,
    )
    addedImages.value = [...addedImages.value, image]
  } catch (error) {
    if (error instanceof ApiError) {
      startUploadWait(error.retryAfterSeconds)
      // A 409 is the cap, reached despite the disabled picker — two tabs, or a stale count.
      imageError.value = error.message
    } else {
      imageError.value = 'The upload did not go through. Try again in a moment.'
    }
  } finally {
    uploading.value = false
    // Cleared so choosing the same file again still fires a change event.
    input.value = ''
  }
}

async function removePhoto(image: ProductImageResponse) {
  if (!original.value) return

  imageError.value = ''
  try {
    await api.delete<void>(`/products/${original.value.id}/images/${image.id}`)
    addedImages.value = addedImages.value.filter((item) => item.id !== image.id)
  } catch (error) {
    imageError.value =
      error instanceof ApiError ? error.message : 'Could not remove that photograph.'
  }
}

onMounted(load)

// The create → edit `replace` changes the parameter to the listing this page is already holding,
// so reloading then would throw away the state it just built. Any other change is a real
// navigation between two listings.
watch(
  () => props.id,
  (next) => {
    if (next !== undefined && original.value?.id === Number(next)) return
    justCreated.value = false
    load()
  },
)
</script>

<template>
  <div class="page editor">
    <p v-if="state === 'loading'" class="status" role="status">Loading…</p>

    <div v-else-if="state === 'missing'" class="notice">
      <h1>No such listing</h1>
      <p>It may have been withdrawn. A withdrawn listing cannot be brought back.</p>
      <RouterLink :to="{ name: 'selling' }" class="back">Your listings</RouterLink>
    </div>

    <div v-else-if="state === 'forbidden'" class="notice">
      <h1>Not your listing</h1>
      <p>Only the owner of a boat can edit its listing.</p>
      <RouterLink :to="{ name: 'browse' }" class="back">Back to browse</RouterLink>
    </div>

    <div v-else-if="state === 'error'" class="error" role="alert">
      <p><strong>Nothing came back.</strong></p>
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="head">
        <RouterLink :to="{ name: 'selling' }" class="up">Your listings</RouterLink>
        <h1>{{ isNew ? 'List a boat' : form.name || 'Untitled listing' }}</h1>
        <p v-if="original && !original.active" class="draft-note">
          This is a draft. Nobody else can see it until you publish.
        </p>
      </header>

      <p v-if="justCreated" class="created" role="status">
        Saved as a draft. Add photographs below, then publish when it is ready.
      </p>

      <form class="form" @submit.prevent="save">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" v-model="form.name" type="text" maxlength="255" autocomplete="off" />
          <p v-if="showProblems && problems.name" class="problem">{{ problems.name }}</p>
        </div>

        <div class="field">
          <label for="description">Description</label>
          <textarea id="description" v-model="form.description" rows="5" maxlength="255"></textarea>
          <p class="hint">{{ 255 - form.description.length }} characters left</p>
          <p v-if="showProblems && problems.description" class="problem">
            {{ problems.description }}
          </p>
        </div>

        <div class="field">
          <label for="category">Category</label>
          <select id="category" v-model="form.categoryId">
            <option value="">Choose a category</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
          <p v-if="showProblems && problems.categoryId" class="problem">
            {{ problems.categoryId }}
          </p>
        </div>

        <fieldset class="field types">
          <legend>What are you offering?</legend>
          <label v-for="option in TYPE_OPTIONS" :key="option.value" class="type">
            <input
              type="radio"
              name="listingType"
              :value="option.value"
              :checked="form.listingType === option.value"
              @change="chooseType(option.value)"
            />
            <span>{{ option.label }}</span>
          </label>
          <p v-if="showProblems && problems.listingType" class="problem">
            {{ problems.listingType }}
          </p>
        </fieldset>

        <!-- Only the prices the chosen type uses. The other is not merely optional — sending it
             is a 400, so there must be no way to fill it in. -->
        <div class="prices">
          <div v-if="usesSalePrice(form.listingType)" class="field">
            <label for="price">Sale price</label>
            <input id="price" v-model="form.price" type="text" inputmode="decimal" />
            <p v-if="showProblems && problems.price" class="problem">{{ problems.price }}</p>
          </div>

          <div v-if="usesDayRate(form.listingType)" class="field">
            <label for="pricePerDay">Day rate</label>
            <input id="pricePerDay" v-model="form.pricePerDay" type="text" inputmode="decimal" />
            <p v-if="showProblems && problems.pricePerDay" class="problem">
              {{ problems.pricePerDay }}
            </p>
          </div>
        </div>

        <p v-if="clearedField" class="cleared" role="status">
          The {{ CLEARED_LABEL[clearedField] }} no longer applies and has been cleared. Saving will
          remove it from the listing.
        </p>

        <div class="submit">
          <button type="submit" class="cta" :disabled="saving || saveWait > 0">
            <template v-if="saveWait > 0">Wait {{ saveWait }}s</template>
            <template v-else-if="saving">Saving…</template>
            <template v-else>{{ isNew ? 'Save as draft' : 'Save changes' }}</template>
          </button>
          <span v-if="saved" class="ok" role="status">Saved</span>
        </div>

        <p v-if="saveError" class="problem" role="alert">{{ saveError }}</p>
      </form>

      <!-- Photographs hang off a listing that exists, so there is nothing to show until it does. -->
      <section v-if="original" class="photos">
        <h2>Photographs</h2>
        <p class="hint">{{ imageCount }} of {{ MAX_IMAGES }}. The first is the one browse shows.</p>

        <ul v-if="imageCount" class="gallery">
          <li v-for="(url, index) in existingImages" :key="url">
            <img :src="url" :alt="`Photograph ${index + 1}`" />
          </li>
          <li v-for="(image, index) in addedImages" :key="image.id">
            <img :src="image.url" :alt="`Photograph ${existingImages.length + index + 1}`" />
            <button type="button" class="remove" @click="removePhoto(image)">
              Remove<span class="sr-only"> photograph {{ existingImages.length + index + 1 }}</span>
            </button>
          </li>
        </ul>

        <p v-if="existingImages.length" class="hint">
          Photographs added in an earlier session cannot be removed here: deleting one needs its id,
          and the API only hands those out when the picture is uploaded.
        </p>

        <div class="upload">
          <label for="photo">Add a photograph</label>
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png"
            :disabled="uploading || atImageLimit || uploadWait > 0"
            @change="addPhoto"
          />
          <p v-if="atImageLimit" class="hint">
            Eight is the limit. Remove one before adding another.
          </p>
          <p v-else-if="uploadWait > 0" class="hint">You can upload again in {{ uploadWait }}s.</p>
        </div>

        <p v-if="imageError" class="problem" role="alert">{{ imageError }}</p>
      </section>

      <section v-if="original" class="publishing">
        <template v-if="!original.active">
          <h2>Publish</h2>
          <p class="hint">
            Publishing puts this listing into browse, where anyone can find it and message you about
            it.
          </p>
          <button type="button" class="cta" :disabled="publishing" @click="publish">
            {{ publishing ? 'Publishing…' : 'Publish listing' }}
          </button>
        </template>
        <template v-else>
          <h2>Published</h2>
          <p class="hint">
            This listing is live.
            <RouterLink :to="{ name: 'listing', params: { id: String(original.id) } }">
              See how it looks
            </RouterLink>
            . To take it down, withdraw it from
            <RouterLink :to="{ name: 'selling' }">your listings</RouterLink> — which is permanent.
          </p>
        </template>
        <p v-if="publishError" class="problem" role="alert">{{ publishError }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.editor {
  padding-block: clamp(1.5rem, 4vw, 3rem) var(--sp-8);
  max-width: 46rem;
}

.status {
  color: var(--ink-soft);
  padding: var(--sp-6) 0;
}

.notice,
.error {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  max-width: var(--measure);
  padding: var(--sp-6) 0 var(--sp-8);
}
.notice h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}
.notice p,
.error p {
  color: var(--ink-soft);
}
.error {
  border-left: 2px solid var(--critical);
  background: var(--critical-wash);
  padding: var(--sp-4) var(--sp-5);
}
.error strong {
  color: var(--ink);
}
.retry {
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: var(--step--1);
  cursor: pointer;
}

.head {
  margin-bottom: var(--sp-6);
}
.up {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
}
.head h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
  margin: var(--sp-2) 0;
}
.draft-note {
  font-size: var(--step--1);
  color: var(--caution);
}

.created {
  margin-bottom: var(--sp-5);
  padding: var(--sp-3) var(--sp-4);
  background: var(--wash);
  border-radius: 3px;
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.form {
  display: grid;
  gap: var(--sp-5);
}

.field {
  display: grid;
  gap: var(--sp-2);
}
.field label,
.types legend {
  font-size: var(--step--1);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.field input[type='text'],
.field select,
.field textarea {
  width: 100%;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  transition: border-color var(--d-pop) var(--ease-out);
}
.field input[type='text']:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--ink-faint);
}
.field textarea {
  resize: vertical;
}

/* Prices are figures to compare, so they are set in mono wherever they appear — including where
   they are being typed. */
#price,
#pricePerDay {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.types {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--sp-2);
}
.type {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--step-0);
  letter-spacing: normal;
  text-transform: none;
  color: var(--ink);
}

.prices {
  display: grid;
  gap: var(--sp-5);
}
@media (min-width: 560px) {
  .prices {
    grid-template-columns: 1fr 1fr;
  }
}

/* The consequence of a type change, said in the caution colour: nothing has failed, but a figure
   the seller typed is about to stop existing. */
.cleared {
  padding: var(--sp-3) var(--sp-4);
  border-left: 2px solid var(--caution);
  background: var(--wash);
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.hint {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

.problem {
  font-size: var(--step--1);
  color: var(--critical);
}

.submit {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}
.cta {
  font-size: var(--step--1);
  background: var(--ink);
  color: var(--ground);
  border: 0;
  border-radius: 3px;
  padding: 0.55rem 1.2rem;
  cursor: pointer;
}
.cta:disabled {
  background: var(--wash);
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}
.ok {
  font-size: var(--step--1);
  color: var(--positive);
}

.photos,
.publishing {
  margin-top: var(--sp-7);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--rule);
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
}
.photos h2,
.publishing h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-2);
}

.gallery {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--sp-3);
  width: 100%;
}
.gallery li {
  position: relative;
}
.gallery img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--wash);
}

.remove {
  position: absolute;
  right: var(--sp-2);
  bottom: var(--sp-2);
  font-size: var(--step--1);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 0.1rem 0.5rem;
  color: var(--ink-soft);
  cursor: pointer;
}

.upload {
  display: grid;
  gap: var(--sp-2);
  justify-items: start;
}
.upload label {
  font-size: var(--step--1);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.upload input[type='file'] {
  font-size: var(--step--1);
  color: var(--ink-soft);
}

.back {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
</style>
