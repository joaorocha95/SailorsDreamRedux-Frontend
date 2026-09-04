# What is left

Everything outstanding, cut by **part of the project** rather than by phase. All eight roadmap
phases are delivered; what remains is here.

[ROADMAP.md](ROADMAP.md) stays canonical for *what was built and why* — the direction, the phase
history, the reasoning behind each decision. This file is canonical for *what has not been built*.
The two are deliberately not allowed to hold the same list twice: this project has already had a
roadmap go four phases without its checkboxes moving, and two copies of a TODO drift faster than
one.

Current as of client `1954b25`, API `37e2cd7`, 2026-09-04.

**Owner** is either **client** (this repo) or **API** (the Spring backend in
`../sailors-dream-redux`). Two thirds of what is left is the API's, which is worth knowing before
planning a week of frontend work.

---

## 1. The client

### 1.1 A dead API is a blank page &nbsp;·&nbsp; client &nbsp;·&nbsp; **do this first**

The router guard awaits `auth.bootstrap()`. The auth store deliberately re-throws anything that is
not a 401, so that "the API is down" surfaces rather than masquerading as "signed out" — the right
instinct. Nothing catches it, so the navigation never resolves and the app renders its header and
nothing else: no message, no retry, no sign anything went wrong.

Every view in this app already has the copy for exactly this case. The guard just never reaches
one of them.

*Why it matters more than it looks:* today, "the backend is down" and "the frontend is broken" are
indistinguishable to whoever is looking at the screen. It is also the reason the E2E smoke test
below would fail.

*Where:* `src/router/index.ts`, the `beforeEach` guard. Small.

### 1.2 The harbour ambience is still a placeholder &nbsp;·&nbsp; client + an asset

`createSurf` synthesises surf from filtered noise. It is audibly a stand-in — no gulls, no
rigging, none of the incidental detail that makes a harbour recording worth having, and the brief
asked for "ambient sea and seagull sound".

The seam is ready: `AmbienceSource` is one function to swap, and `ambience.ts` documents the
replacement. What is missing is the recording itself, served from our own origin — the same
argument that decided the fonts.

*Where:* `src/lib/ambience.ts`, `createSource`.

### 1.3 Testing

**The E2E suite is the Vite scaffold's two smoke tests.** Playwright is configured properly —
`webServer`, dev vs preview, projects — and nothing uses it. No test walks the funnel that phases
3 to 6 built: browse → listing → message → thread → save → sell.

One of the two existing tests asserts an `h1` renders "without the backend running", which is
exactly the case item 1.1 turned into a blank page. It would fail. *(Not demonstrated by running
it — Chromium will not launch on this machine, `spawn UNKNOWN`. The evidence is watching
`document.querySelector('h1')` return null in a browser with the backend stopped.)*

**Six lib modules have no unit tests**, and no store, component or view has any at all:

| Module | Why it is worth covering |
| --- | --- |
| `polling.ts` | Timer logic with visibility and focus edges — overlapping ticks, a tab returning, a poll that fails. Exactly the shape of thing that breaks silently. |
| `retry-after.ts` | Counts off a wall-clock deadline specifically so a throttled background tab does not desynchronise it. That reasoning is untested. |
| `directory.ts` | Caches promises and *deliberately* does not cache network failures. The distinction is one line and easy to lose. |
| `money.ts` | Small, but it decides what a price says. Note it renders €128,000.50 as "€128,001". |
| `image-upload.ts` | Two refusals and their copy. |
| `ambience.ts` | Audio graph; hard to test meaningfully, lowest value here. |

The six that *are* tested are the ones with rules in them, which was the right instinct — this is
about the ones that turned out to have rules too.

---

## 2. The API

Nothing here can be worked around from the client. Each entry says what would unblock it.

### 2.1 Blocking deployment entirely

**The SPA cannot be served same-origin.** Copying `dist/` into the backend's static resources and
asking for `/` returns **401**: the shell sits behind `anyRequest().authenticated()`, and there is
no fallback route, so every client-side URL (`/messages/1`, `/listings/2`) is a 401 too.

*Needs:* `permitAll` for `/`, `/index.html`, `/assets/**`, `/favicon.ico` and `/fonts/**`, plus a
forward for unmatched non-API paths that does **not** swallow the API's own 404s.

*Until then* the only way to run this is the dev proxy, which the roadmap has said from the start
is not a deployment. **Nothing ships before this.**

### 2.2 Blocking whole features

**Uploaded images are unreachable in the default store.** `InMemoryImageStore` keeps bytes in a map
and hands out `http://localhost:8080/local-images/<key>`; nothing serves that path and
`anyRequest().authenticated()` answers 401 for it besides. Uploads succeed and nothing renders.
*Needs:* a resource handler plus a `permitAll`, or an honest admission that `memory` is test-only
and dev should run `oci`.
*Cost of not fixing:* **every image-shaped surface in the app has never once been seen working** —
browse cards, the listing gallery, avatars, the whole phase-4 photo manager.

**A photograph cannot be named after the session that uploaded it.** Deleting one needs an image
id; ids come back only from the upload response, and there is deliberately no
`GET /products/{id}/images`. So a picture added last week can be seen and not removed.
*Needs:* `GET /products/{id}/images`, or ids alongside the URLs on the detail response.

**No image reorder.** Position is assigned on append and nothing changes it, so the cover photo is
whichever went up first. *Needs:* a position endpoint — worth doing after the item above, since a
reorder UI needs ids for the same reason a delete does.

**No unpublish.** `PATCH /products/{id}/activate` only ever sets `active = true`; the only way down
is `DELETE`, which soft-deletes with nothing to undo it. A seller who wants a listing off browse
for a fortnight has to destroy it. *Needs:* a deactivate verb, or `active` on
`UpdateProductRequest`.

**Reviews cannot be read at all.** `POST /reviews` is the whole feature — no received reviews, no
aggregate rating, no way to ask whether you have already reviewed somebody. Two consequences: the
"one per direction per pair" gate can only be guessed at from a `localStorage` memo
(`src/lib/reviewed.ts`), and **a profile page is unbuildable**, because the two things it would
exist to show are the two that do not exist. *Needs:* `GET /users/{id}/reviews` and a rating on
`UserResponse`.

**An admin cannot see why an account is off.** `UserResponse.isActive` collapses deactivated,
banned and closed into one boolean — deliberately, and the DTO comment says the distinction "gets
added" once an admin surface exists. It exists now. The staff directory offers Ban and Unban side
by side because a toggle would have to guess which state a row is in. *Needs:* the three flags, or
a status enum — or a separate admin-only shape, if telling every caller who has been banned is
what was being avoided.

### 2.3 Shape and ergonomics

**An inbox row cannot name anything.** `ChatResponse` is ids only, so the client resolves the
counterparty and the listing itself (`src/lib/directory.ts`, memoised per session). Sound
reasoning on the server — nesting the user would leak a password hash — but it leaves a row with
nothing a person recognises. *Needs:* `counterpartyName` and `productName` on the summary, at which
point that file can be deleted.

**`GET /users` is unpaged.** The whole table in one response, so the staff directory searches what
it already holds. It is the one collection here with no natural ceiling — a wishlist is bounded by
one person's saves and a block list by one person's patience, but the user table is bounded by
success. *Needs:* a `PageResponse` and a `?name=` filter, the shape browse already has.

**The wishlist does not filter withdrawn listings.** `findWishlistOf` has no `deleted` clause, so a
saved card can point at a boat whose detail page 404s, and nothing on the browse shape says which.
*Needs:* the same `not deleted` filter every other read path has — or, if keeping the row is
deliberate, a flag saying so.

**Descending price sorts are unsafe.** Nothing pins where nulls land and Postgres puts them *first*
descending, so "price, high to low" would open with every rent-only listing. This is why the browse
sort control offers ascending orders only. *Needs:* `NULLS LAST` on the descending case — the same
trap `ChatRepository` already dodges by coalescing. Then add the two options to `SORT_OPTIONS` in
`src/views/BrowseView.vue`.

### 2.4 Correctness and hygiene

**Not every error is a `ProblemDetail`.** A malformed request body raises
`HttpMessageNotReadableException`, which `GlobalExceptionHandler` does not handle, so the client
gets Spring's default error shape — `timestamp`/`error`/`path`, no `detail` — **with a full stack
trace in it**. `ApiError` degrades to "Request failed with status 400", which is survivable; the
stack trace reaching a browser is less so. *Needs:* a handler for it, and
`server.error.include-stacktrace: never`.

**Three refusals are written for a log, not a person.** "User 3 has already reviewed user 7", the
never-negotiated message, and "User 3 already has an unreviewed report against user 7" all reach
the person who just filled in the form, because `detail` is what the client shows. Everywhere else
in this API that copy is good. The report one is worked around in `SafetyActions.vue` — the only
`detail` this client suppresses — which is a patch over a string we do not own, and it will drift.
*Needs:* names, or second-person phrasing.

**No bootstrap path.** `accountType` is never settable through the API, so the first admin is made
with SQL; and nothing can be listed until a category exists, which only an admin can create. A
fresh database cannot reach a usable state without a hand-written `UPDATE` (documented in the
[README](README.md)). *Needs:* a seed profile, or a first-run rule promoting the first account.

---

## 3. Build and deployment

- **Same-origin serving.** The client half is done — `/api` was a dev-proxy fiction and the built
  bundle no longer contains it, overridable with `VITE_API_BASE`. The server half is §2.1.
- **Cache headers for `/fonts/`.** The six woff2 files are served from `public/` under stable
  names, so they want a long `max-age` and `immutable` from whatever ends up serving them. Nothing
  sets that yet, and a font refetched on every visit undoes most of the reason for self-hosting.
- **CI.** Nothing runs `type-check`, `test:unit` or `test:e2e` automatically. Every check in this
  project so far has been run by hand.

---

## 4. Design and assets

- **The harbour recording** — §1.2.
- **Vendor the font licences.** `public/fonts/LICENSES.md` names the families and states OFL 1.1,
  but the licence requires the full text and each copyright line to be *distributed with* the
  fonts, and a link is not distribution. Each family's `OFL.txt` ships in its download. Do this
  before serving publicly.

---

## 5. Open decisions

**Currency.** `Product` has no currency field; every price is a bare decimal and the client assumes
EUR in one module (`src/lib/money.ts`), so there is one place to change. Needs either a column on
the product or a documented decision that this is a single-currency platform. Still open.

*(HEIC is settled — rejected at the picker on both upload surfaces. See ROADMAP.md.)*

---

## What has never been verified

Worth stating plainly, because "built" and "seen working" are not the same thing here.

- **Anything image-shaped.** Blocked by §2.2 — no image has ever rendered in this app.
- **Reduced motion.** The policy was rewritten in phase 8 and is verified by reading the cascade;
  the browser pane cannot emulate `prefers-reduced-motion`.
- **Any deployed build.** Everything has run through the dev proxy. §2.1.
- **The mobile drawer, and every layout below 640px**, on a real device.
