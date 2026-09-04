<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/http'
import { lookupUser } from '@/lib/directory'
import { imageRejection } from '@/lib/image-upload'
import { useRetryAfter } from '@/lib/retry-after'
import { useAuthStore } from '@/stores/auth'
import { useBlocksStore } from '@/stores/blocks'
import type { UserResponse } from '@/types/api'

/**
 * The account: what can be changed, what can be switched off, and what cannot be undone.
 *
 * Only name and phone are editable. Email is the login identifier and unique, the password has
 * its own flow that needs the current one, and the avatar is an object key the upload endpoint
 * is the only thing allowed to mint — a text field for it here would point the picture at any
 * URL its owner liked and make the upload path decorative.
 *
 * The three account actions are deliberately laid out in order of severity, and separated: a
 * reversible switch, then an irreversible one behind a typed confirmation.
 *
 * Four unrelated jobs share this page — details, photograph, blocked people, switching off — and
 * they are four `<section>`s rather than four routes because each is a handful of controls that
 * somebody reaches for once a year. The ordering is the argument: the things you might change
 * today are at the top, and the two that end your account are at the bottom, past everything else.
 */

const auth = useAuthStore()
const blocks = useBlocksStore()
const router = useRouter()

const name = ref(auth.user?.name ?? '')
const phoneNumber = ref(auth.user?.phoneNumber ?? '')

const savingProfile = ref(false)
const profileError = ref('')
const profileSaved = ref(false)

const uploading = ref(false)
const pictureError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const { secondsLeft: uploadWait, start: startUploadWait } = useRetryAfter()

const deactivating = ref(false)
const closing = ref(false)
const closeConfirmation = ref('')
const dangerError = ref('')

/**
 * Whether anything has actually been typed, so an untouched form cannot spend a request.
 *
 * Compared against the store rather than a snapshot taken at mount: the store is what the avatar
 * upload and the reactivation flow also write to, so this stays correct when the user is replaced
 * by something other than this form.
 */
const dirty = computed(
  () => name.value !== auth.user?.name || phoneNumber.value !== auth.user?.phoneNumber,
)

/** Typing the word is the confirmation. Nothing irreversible happens on a single click. */
const closeArmed = computed(() => closeConfirmation.value.trim().toUpperCase() === 'CLOSE')

/**
 * One line of error handling, shared by all six actions on this page.
 *
 * An `ApiError` already carries the server's `detail`, which is written to be read by a person, so
 * it is shown as-is. Anything else is not an answer from the API at all — a dead connection, a
 * proxy that returned HTML — and gets copy that says so rather than leaking a `TypeError` into
 * the interface.
 */
function describe(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

async function saveProfile() {
  if (!auth.user) return

  savingProfile.value = true
  profileError.value = ''
  profileSaved.value = false

  try {
    // Only what actually changed. A null field means "leave unchanged" on the server, and a
    // present-but-blank one is a 400 rather than a silently blanked column — so sending the
    // whole form back would turn an untouched field into a value being re-asserted.
    const updated = await api.patch<UserResponse>(`/users/${auth.user.id}`, {
      name: name.value === auth.user.name ? undefined : name.value,
      phoneNumber: phoneNumber.value === auth.user.phoneNumber ? undefined : phoneNumber.value,
    })
    auth.setUser(updated)
    profileSaved.value = true
  } catch (error) {
    profileError.value = describe(error, 'Could not reach the server. Try again in a moment.')
  } finally {
    savingProfile.value = false
  }
}

async function choosePicture(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !auth.user) return

  pictureError.value = ''

  // Checked here rather than left to the server, because the common failure is an iPhone photo
  // and "the uploaded file is not an image" would be a baffling thing to read about a photograph.
  // Shared with the listing photographs, which face exactly the same two refusals.
  const rejection = imageRejection(file)
  if (rejection) {
    pictureError.value = rejection
    input.value = ''
    return
  }

  uploading.value = true
  try {
    const updated = await api.upload<UserResponse>(
      `/users/${auth.user.id}/profile-picture`,
      file,
      'PUT',
    )
    auth.setUser(updated)
  } catch (error) {
    pictureError.value = describe(error, 'The upload did not go through. Try again in a moment.')
    if (error instanceof ApiError) startUploadWait(error.retryAfterSeconds)
  } finally {
    uploading.value = false
    // Cleared so choosing the same file again still fires a change event.
    input.value = ''
  }
}

async function removePicture() {
  if (!auth.user) return

  uploading.value = true
  pictureError.value = ''

  try {
    await api.delete<void>(`/users/${auth.user.id}/profile-picture`)
    // The DELETE answers 204 with no body, unlike the upload which hands back the whole user. So
    // the one field that changed is patched onto the cached copy rather than refetching — a
    // second round trip to learn something we already know.
    auth.setUser({ ...auth.user, profilePictureUrl: null })
  } catch (error) {
    pictureError.value = describe(error, 'Could not reach the server. Try again in a moment.')
  } finally {
    uploading.value = false
  }
}

/**
 * The reversible one. Deactivating hides the account and unpublishes its listings, and the owner
 * can undo it themselves — which is exactly why a deactivated user is still allowed to sign in.
 *
 * They are sent to the screen that undoes it rather than left here, because a session that
 * silently refuses every write is a worse place to be than one screen that explains itself.
 */
async function deactivate() {
  if (!auth.user) return

  deactivating.value = true
  dangerError.value = ''

  try {
    const updated = await api.patch<UserResponse>(`/users/${auth.user.id}/deactivate`)
    auth.setUser(updated)
    await router.replace({ name: 'account-deactivated' })
  } catch (error) {
    dangerError.value = describe(error, 'Could not reach the server. Try again in a moment.')
  } finally {
    deactivating.value = false
  }
}

/**
 * The one that cannot be undone. The server tombstones the row: neither reactivate nor unban will
 * reopen it, and every other state change on a closed account is a 409 rather than a no-op.
 *
 * Guarded twice — by the typed word and by re-checking it here — because the check that matters is
 * the one nearest the request, not the one on the button.
 */
async function closeAccount() {
  if (!auth.user || !closeArmed.value) return

  closing.value = true
  dangerError.value = ''

  try {
    await api.delete<void>(`/users/${auth.user.id}`)
    // The account is tombstoned server-side; the session that is left belongs to something that
    // can no longer be used, so end it rather than leaving a signed-in shell behind.
    await auth.logout()
    await router.replace({ name: 'browse' })
  } catch (error) {
    dangerError.value = describe(error, 'Could not reach the server. Try again in a moment.')
    // Reset only on failure, deliberately — there is no `finally` here. On success this component
    // is being navigated away from, and clearing the flag would flash the button back to
    // "Close account" for one frame on a page that no longer has an account behind it.
    closing.value = false
  }
}

/**
 * The blocked list, and why it needs a home here.
 *
 * Blocking someone removes the conversation from **both** inboxes — that is the point of it — but
 * it also means the thread is no longer anywhere you can navigate to. Without this section the
 * only route back to unblocking somebody would be a bookmarked thread URL, which is to say that
 * an easily-reversible act would be, in practice, permanent.
 *
 * `GET /blocks` returns ids, so the names are resolved the same way an inbox row's are.
 */
const blockedNames = ref<Record<number, string>>({})
const unblocking = ref<number | null>(null)
const blockError = ref('')

/**
 * Names for the blocked ids, filled in after the rows are on screen — the same memoised lookup an
 * inbox row uses, so somebody blocked from two places is fetched once.
 */
async function loadBlockedNames() {
  await Promise.all(
    blocks.blocks.map(async (block) => {
      const user = await lookupUser(block.blockedUserId)
      if (user) blockedNames.value[block.blockedUserId] = user.name
    }),
  )
}

async function unblock(userId: number) {
  unblocking.value = userId
  blockError.value = ''
  try {
    await blocks.unblock(userId)
  } catch (error) {
    blockError.value = describe(error, 'Could not unblock that person just now.')
  } finally {
    unblocking.value = null
  }
}

onMounted(async () => {
  await blocks.ensureLoaded()
  void loadBlockedNames()
})
</script>

<template>
  <div class="page account">
    <h1>Your account</h1>

    <section class="block">
      <h2>Details</h2>
      <p class="note">
        Your email and date of birth cannot be changed here. Email is how you sign in.
      </p>

      <form @submit.prevent="saveProfile">
        <label>
          <span>Name</span>
          <input
            v-model="name"
            type="text"
            autocomplete="name"
            required
            :disabled="savingProfile"
          />
        </label>

        <label>
          <span>Phone</span>
          <input
            v-model="phoneNumber"
            type="tel"
            autocomplete="tel"
            required
            :disabled="savingProfile"
          />
        </label>

        <p v-if="profileError" class="error" role="alert">{{ profileError }}</p>
        <p v-else-if="profileSaved" class="saved" role="status">Saved.</p>

        <button type="submit" class="primary" :disabled="savingProfile || !dirty">
          {{ savingProfile ? 'Saving…' : 'Save changes' }}
        </button>
      </form>
    </section>

    <section class="block">
      <h2>Photograph</h2>

      <div class="avatar-row">
        <img v-if="auth.user?.profilePictureUrl" :src="auth.user.profilePictureUrl" alt="" />
        <div v-else class="avatar-empty" aria-hidden="true"></div>

        <div class="avatar-actions">
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept="image/jpeg,image/png"
            :disabled="uploading || uploadWait > 0"
            @change="choosePicture"
          />
          <button
            type="button"
            class="quiet-btn"
            :disabled="uploading || uploadWait > 0"
            @click="fileInput?.click()"
          >
            <template v-if="uploadWait > 0">Wait {{ uploadWait }}s</template>
            <template v-else-if="uploading">Uploading…</template>
            <template v-else-if="auth.user?.profilePictureUrl">Replace</template>
            <template v-else>Upload a picture</template>
          </button>

          <button
            v-if="auth.user?.profilePictureUrl"
            type="button"
            class="quiet-btn"
            :disabled="uploading"
            @click="removePicture"
          >
            Remove
          </button>

          <p class="note">JPEG or PNG, up to 8 MB.</p>
        </div>
      </div>

      <p v-if="pictureError" class="error" role="alert">{{ pictureError }}</p>
    </section>

    <section class="block">
      <h2>Blocked</h2>

      <p v-if="blocks.status === 'loading'" class="note" role="status">Loading…</p>
      <p v-else-if="blocks.status === 'error'" class="error" role="alert">
        {{ blocks.errorMessage }}
      </p>
      <p v-else-if="blocks.blocks.length === 0" class="note">
        Nobody. Blocking someone from a conversation or a listing stops the two of you reaching each
        other, and undoing it lives here.
      </p>

      <ul v-else class="blocked">
        <li v-for="block in blocks.blocks" :key="block.id">
          <span>{{ blockedNames[block.blockedUserId] ?? 'Someone' }}</span>
          <button
            type="button"
            class="link-btn"
            :disabled="unblocking === block.blockedUserId"
            @click="unblock(block.blockedUserId)"
          >
            Unblock
          </button>
        </li>
      </ul>

      <p v-if="blockError" class="error" role="alert">{{ blockError }}</p>
    </section>

    <!--
      Last on the page, and the two options in order of severity with the reversible one first.
      That ordering is the argument: somebody who only wants a break should meet deactivation
      before they meet closure, and both notes say plainly which of the two they are reading.

      Neither is a modal. A confirmation dialogue would let this be dismissed and forgotten
      halfway through, and the typed word below does the same job without taking the page away.
    -->
    <section class="block danger">
      <h2>Switching off</h2>

      <div class="option">
        <p><strong>Deactivate.</strong> Reversible.</p>
        <p class="note">
          Your listings are unpublished and nobody can start a conversation with you. You can sign
          in again at any time and turn the account back on — though the listings stay unpublished
          until you publish them yourself.
        </p>
        <button type="button" class="quiet-btn" :disabled="deactivating" @click="deactivate">
          {{ deactivating ? 'Deactivating…' : 'Deactivate my account' }}
        </button>
      </div>

      <div class="option">
        <p><strong>Close.</strong> Permanent.</p>
        <p class="note">
          Closing removes your personal details and cannot be undone — not by you, and not by anyone
          here. You will not be able to sign in or reopen the account afterwards. If you only want a
          break, deactivate instead.
        </p>

        <!--
          Typing the word, not a second click. This is the only irreversible action in the app,
          and the gap between "I pressed something" and "I wrote the word CLOSE" is the whole
          protection: a mis-click cannot produce it, and neither can a click on the wrong row.

          `autocomplete="off"` because a browser offering to fill this in would defeat it
          entirely.
        -->
        <label class="confirm">
          <span>Type CLOSE to confirm</span>
          <input v-model="closeConfirmation" type="text" autocomplete="off" :disabled="closing" />
        </label>

        <!-- Disabled until the word matches, so the control is inert rather than merely refusing
             when pressed. `type="button"` on both, since neither sits in a form and a stray
             submit is not a thing that should be possible here. -->
        <button
          type="button"
          class="destructive"
          :disabled="!closeArmed || closing"
          @click="closeAccount"
        >
          {{ closing ? 'Closing…' : 'Close my account permanently' }}
        </button>
      </div>

      <p v-if="dangerError" class="error" role="alert">{{ dangerError }}</p>
    </section>
  </div>
</template>

<style scoped>
.account {
  padding-block: clamp(2rem, 6vw, 4rem) var(--sp-8);
  max-width: 34rem;
}

h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--step-3);
}

h2 {
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 400;
}

.block {
  margin-top: var(--sp-7);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--rule);
  display: grid;
  gap: var(--sp-4);
}

.note {
  font-size: var(--step--1);
  color: var(--ink-soft);
  line-height: 1.45;
}

form {
  display: grid;
  gap: var(--sp-4);
  justify-items: stretch;
}

label {
  display: grid;
  gap: var(--sp-2);
}
label span {
  font-size: var(--step--1);
  color: var(--ink-faint);
}

input[type='text'],
input[type='tel'] {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 0.6rem 0.7rem;
  font: inherit;
  color: var(--ink);
  transition: border-color var(--d-pop) var(--ease-out);
}
input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
input:disabled {
  color: var(--ink-faint);
}

.avatar-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-5);
}
.avatar-row img,
.avatar-empty {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--wash);
  flex: none;
}
.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-3) var(--sp-4);
}
.avatar-actions .note {
  flex-basis: 100%;
}

.primary,
.destructive {
  border: 0;
  border-radius: 3px;
  padding: 0.65rem 1rem;
  font: inherit;
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  justify-self: start;
  font-variant-numeric: tabular-nums;
  transition: transform var(--d-press) var(--ease-out);
}
.primary {
  background: var(--ink);
  color: var(--ground);
}
.destructive {
  background: var(--critical);
  color: var(--ground);
}
.primary:active:not(:disabled),
.destructive:active:not(:disabled) {
  transform: scale(0.97);
}
.primary:disabled,
.destructive:disabled {
  background: var(--ink-faint);
  cursor: default;
  transform: none;
}

.quiet-btn {
  font: inherit;
  font-size: var(--step--1);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--rule);
  padding: 0 0 2px;
  color: var(--ink);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.quiet-btn:disabled {
  color: var(--ink-faint);
  border-bottom-color: transparent;
  cursor: default;
}
.quiet-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.quiet-btn:focus-visible,
.primary:focus-visible,
.destructive:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}

.danger .option {
  display: grid;
  gap: var(--sp-3);
  justify-items: start;
  padding: var(--sp-4) 0;
  border-top: 1px solid var(--rule-soft);
}
.danger .option strong {
  color: var(--ink);
}
.confirm {
  width: 100%;
  max-width: 16rem;
}

.error {
  color: var(--critical);
  font-size: var(--step--1);
  background: var(--critical-wash);
  border-left: 2px solid var(--critical);
  padding: var(--sp-3) var(--sp-4);
  line-height: 1.45;
}
.saved {
  font-size: var(--step--1);
  color: var(--positive);
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

.blocked {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-3);
  max-width: var(--measure);
}
.blocked li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--rule-soft);
}

.link-btn {
  background: none;
  border: 0;
  padding: 0;
  font-size: var(--step--1);
  color: var(--ink-soft);
  text-decoration: underline;
  cursor: pointer;
}
.link-btn:disabled {
  color: var(--ink-faint);
  cursor: default;
  transform: none;
}
</style>
