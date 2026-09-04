# Roadmap

What this client is, what is built, and what comes next. The API it talks to is the Spring
backend in `sailors-dream-redux`; its own reference lives at `docs/reference.html` there.

## The brief

- **Vue 3** (`<script setup>`) + TypeScript + Vite, with Router, Pinia, Vitest and Playwright.
- **Navy blue as the main colour**, and it should read as **fresh and premium**.
- **Ambient sea and seagull sound** on the browsing surface.

## The direction: Atelier

Chosen from three (Atelier / Helm / Berth). Editorial and light — navy as ink on a near-white
ground, Instrument Serif for names, DM Sans for body, JetBrains Mono for prices, a two-column grid
with large 4:3 photography.

**Premium through restraint and scale, not density.** Two reasons it won:

1. **It fits what the data is.** A listing has a name, a description, a category, a type, one or
   two prices and up to eight photographs. There is no length, year, or berth count. A
   specification-dense UI would be designing around empty columns.
2. **Restraint is cheaper to execute well.** Whitespace, one good serif and large images is
   achievable by one person; density needs many small components all detailed correctly and fails
   loudly when one is sloppy.

If real specs arrive later, Helm's spec rows drop into Atelier's detail page without changing the
identity. That path stays open; the reverse does not.

## Shape of the product

The backend deliberately has **no orders** — no cart, no checkout, no payment. The funnel is
*browse → open a thread → negotiate*, and whether a deal happens is off-platform. So the inbox is
not a secondary feature: it is the second half of the app and deserves equal design.

---

## Phase 0 — Shell &nbsp;·&nbsp; done (`887eb78`)

- Vite dev proxy forwarding `/api/*` to `:8080`, verified end to end against a stub.
- `src/lib/http.ts` — cookies, CSRF header, `ProblemDetail` → `ApiError`, central 401. 15 tests.
- `src/types/api.ts` — DTOs mirrored by hand from the backend records.
- Pinia auth store bootstrapping from `GET /auth/me`; router guards await it.
- Atelier tokens and the motion spec in `src/assets/tokens.css`.
- Browse fetching and rendering real listings; login exercising the write path.

## Phase 1 — Browse &nbsp;·&nbsp; done (`1c55687`, `ac07a78`, `1c8dcff`, `62cb2d2`)

Entirely guest-visible, so it needed no session and was the right first slice.

- [x] Filter panel wired to `ProductSearchCriteria` — name, category, listing type.
- [x] **Two separate price ranges.** A sale price and a day rate are not comparable; never one
      slider. Each pair also excludes listings whose column is null for free.
- [x] Sort control offering **only** `id`, `name`, `price`, `pricePerDay`. Anything else is a 400.
      — **ascending orders only.** Nothing on the server pins where nulls land, and Postgres puts
      them *first* descending, so "price, high to low" would open with every rent-only listing.
      Adding the two descending options needs `NULLS LAST` in the backend first; the client cannot
      fix an ordering it does not choose.
- [x] Pagination over `PageResponse`. Stagger the grid on **first paint only** — re-staggering
      every page turn makes page 4 feel slower than page 1.
- [x] Category list from `GET /categories` (guest-readable).
- [x] Listing detail: gallery from the *detail* response shape (`imageUrls` is an array here, null
      on browse), seller line, "Message the owner" CTA. The CTA became live in phase 3, which is
      when there was an inbox for it to open into.
- [x] Mobile filter drawer — `vaul-vue`, `--ease-drawer`.
- [x] **Harbour ambience** on browse: opt-in, off by default, remembered, fades in, suspends on
      `visibilitychange`. Kept off detail and thread views.
- [ ] **The recording itself.** What ships is still `createSurf`, filtered noise standing in for a
      harbour — no gulls, no rigging, none of the incidental detail worth having. The seam is
      ready (`AmbienceSource`, one function to swap); what is missing is a field recording served
      from our own origin. The only phase-1 item still open.
- [x] Empty, loading and error states for each.

## Phase 2 — Identity &nbsp;·&nbsp; done (`54f8062`, `de137ba`)

- [x] Signup form (`POST /users`), honouring the IP-keyed quota's 429 + `Retry-After`. Signing up
      does not start a session, so the form signs in immediately afterwards rather than handing
      over a second form asking for the same two fields.
- [x] **Deactivated-account screen.** A self-deactivated user *can* sign in — that is deliberate
      server-side, because reactivating requires being authenticated. Offer a way back, don't lock
      them out.
- [x] Banned and closed accounts get distinct 403 messages; don't collapse them into one. Kept
      distinct by showing the server's `detail` verbatim — it is written to be read.
- [x] Profile edit (name, phone only) and profile picture upload.
- [x] Account closure flow, with the irreversibility stated plainly before confirming. Gated
      behind typing the word, not a single click.
- [x] Deactivation, which phase 2 did not list: the reactivate screen already existed with nothing
      in the app able to reach the state it undoes.

## Phase 3 — Negotiation &nbsp;·&nbsp; done (`bb3c6aa`)

The other half of the product.

- [x] Inbox: paged, newest activity first, per-viewer unread counts.
- [x] Thread view; `PATCH /chats/{id}/read` is explicit — opening does not mark read. Spent
      deliberately: on arrival, and when a reply lands **while the tab is in front**.
- [x] Composer. `<TransitionGroup>` with **CSS transitions, not keyframes** — messages arrive in
      bursts and transitions retarget mid-flight.
- [x] Polling: 25s, **paused when the tab is hidden**, refetch on focus, never overlapping itself.
      No websockets exist.
- [x] **Blocked-thread state.** Your own blocks come from `GET /blocks` and replace the composer
      before anything is written; a block from the other direction is invisible until the send's
      403, which is correct — answering "does this person block me" would tell a harasser what
      they had been shut out of.
- [x] **Withdrawn-listing state.** The listing 404s but the chat still opens — the header carries
      a "no longer listed" treatment in the caution colour, not an error one.
- [x] Starting a thread from a listing, which phase 3 did not list: `POST /chats` requires a first
      message, so without it nothing in the app could reach an inbox.

## Phase 4 — Selling &nbsp;·&nbsp; done (`584fa60`)

The most complex forms in the app, and the first phase where the roadmap asked for things the API
cannot do. Those are listed under *What the API cannot do yet*, not quietly dropped.

- [x] Create/edit listing with **conditional price fields** driven by `listingType`: `price` for
      `FOR_SALE`, `pricePerDay` for `FOR_RENT`, both for `BOTH`. A price the type has no use for is
      rejected, not ignored.
- [x] Changing the type clears the price that no longer applies — on a PATCH, null means "leave
      unchanged", so the server does this and the UI shows it happening. The rule lives in
      `src/lib/listing-form.ts` with the tests it deserves: the client's job is to **omit** the
      price the resulting type does not use, because sending it is a 400 and omitting it is the
      only way the server can clear it.
- [x] Image upload: cap of 8 (picker disabled at 8; the 9th is a 409).
- [ ] Image **reorder** — no endpoint exists. Position is assigned on append, so the first upload
      is the cover and that is the whole of the ordering story.
- [ ] Image **delete**, except for pictures uploaded in the same session. Shipped that far and no
      further: deletion needs an image id, ids come back only from the upload response, and there
      is deliberately no `GET /products/{id}/images`.
- [x] **HEIC.** Rejected at the picker, with a sentence saying what to do instead. Settled — see
      *Open questions*.
- [x] Publish; drafts view via `includeInactive=true` **with `sellerId` = you** (anything else is
      a 403). Drafts and published listings share one page, because `includeInactive` drops the
      active filter rather than inverting it.
- [ ] **Unpublish** — no endpoint exists. `PATCH /products/{id}/activate` only ever sets
      `active = true`. What ships instead is Withdraw (`DELETE`), stated plainly as permanent and
      behind a second press.

## Phase 5 — Wishlist and reviews &nbsp;·&nbsp; done (`7b74d6d`)

Two features that look alike from the outside and are shaped by opposite facts about the API.

- [x] Save/unsave from the card and the detail page; wishlist page in the browse shape.
      `GET /wishlist` is **unpaged**, which is what makes one store answer for every card on a
      grid — there is no "is this saved?" endpoint and none is needed. Both writes are idempotent,
      which is what makes the optimistic update safe.
- [x] Leave a review, from the thread — the one place a shared chat is provably there, which is
      the only evidence this platform records that two people ever dealt with each other.
- [ ] **"Only offer it where it will succeed" — half done.** The chat gate is honoured. *One per
      direction per pair* cannot be: there are no read endpoints for reviews at all, so a client
      cannot ask whether it has already written one. `src/lib/reviewed.ts` is a `localStorage`
      memo of writes this browser actually made — not a source of truth, and wrong only in the
      harmless direction. A review left on another device is offered again and refused by the
      server.
- [x] Withdrawn and unpublished saved listings. Nothing prunes a wishlist row when the boat behind
      it changes: an unpublished one is marked rather than hidden, and a *withdrawn* one cannot be
      detected at all, so it falls through to the listing page's "no longer listed" screen.

## Phase 6 — Safety &nbsp;·&nbsp; done (`1bc5b56`)

Two controls that sit next to each other and are not the same kind of thing. **Blocking is between
the two of you** — idempotent, reversible, and the one action with no retirement gate on either
side, because every other gate guards something that publishes into the platform and blocking
publishes nothing. **Reporting is a private message to staff** — rate-limited, not retractable, and
deliberately not gated on ever having negotiated.

- [x] Block and unblock, from a thread **and from a listing**. Not from a profile: there is no
      profile page, and there cannot be one until reviews can be read.
- [x] Report, with the reason enum and optional detail — **1000** characters here, not the 255
      nearly every other text field carries.
- [x] One unreviewed report per pair, explained rather than shown raw. The single place in this
      client where the server's `detail` is deliberately not surfaced; see the list below for why.
- [x] **A blocked list on the account page**, which phase 6 did not list and needed. Blocking
      removes the conversation from *both* inboxes, so without somewhere to undo it the only route
      back would be a bookmarked thread URL — an easily-reversible act would be permanent in
      practice.

Neither control is behind a confirmation, deliberately: a safety control that asks twice is one
somebody being harassed has to fight through, and blocking is undone by the button that replaces
it.

## Phase 7 — Admin &nbsp;·&nbsp; done (`9083c64`)

Plain, as planned — same tokens, whitespace turned down. Three pages rather than a dashboard: a
moderation queue, a controlled vocabulary and a user directory are unrelated jobs that share an
audience and nothing else.

- [x] Category maintenance; deleting one unfiles its listings rather than deleting them. The
      confirming press says so in as many words.
- [x] Report queue (oldest first — the server drops any `?sort=`) and mark-reviewed. Ban lives in
      the row, since that is the loop: somebody reports, staff read this, staff act.
- [x] Ban/unban; user directory. **Both verbs, not a toggle** — see below.
- [ ] **Telling banned from deactivated from closed.** `isActive` is one boolean over three flags,
      and the DTO left them un-broken-out "until [there is] an admin surface to show it on". This
      is that surface, so a row can say *whether* an account is usable and never *why*. Item 9 on
      the list below.

`GET /users` is unpaged, so the directory's search filters what is already loaded rather than
querying. Fine at this size, wrong at a real one — the first thing to change if the platform grows.

## Phase 8 — Polish &nbsp;·&nbsp; done, except what the backend owns

The first phase audited against a **running app in a browser** rather than against source, which
is what turned up the two real defects. Both had been shipped for phases and neither was visible
in a diff.

- [x] Motion pass against the spec below. Clean: no `ease-in` anywhere, every duration from a
      token, and nothing transitioning a layout property — only `transform`, `opacity` and colour.
- [x] Focus order, labels, live regions on async states. **A browse card offered "save this"
      before it said which listing it was** — the save control was earlier in the DOM than the card
      link, so tab order ran save, card, save, card. Labels were fine (`for`/`id` in the filters,
      wrapping labels on the auth forms — both verified by computed accessible name, not by
      eyeballing the markup). The result counts on browse and the report queue are live regions
      now: they are the *answer* to a filter, and only sighted users were being told anything had
      happened.
- [x] `prefers-reduced-motion` audit. **The global rule said "gentler, not none" and did exactly
      none** — `0.001ms !important` on `*`, which is an instant cut, and which silently outranked
      the four components that had each written a considered reduced-motion rule of their own. The
      drawer's 120ms and the gallery's 80ms had never once run. One policy now, at `--d-reduced`.
- [x] Production build served same-origin — **the client half.** `/api` was hardcoded in
      `http.ts`, and that prefix is a dev-proxy fiction: the API's routes are at the root, so the
      built app would have asked Spring for paths it has never heard of. It is now empty in
      production, overridable with `VITE_API_BASE`. Verified absent from the bundle.
- [ ] Production build served same-origin — **the server half.** Copying `dist/` into the
      backend's static resources and asking for `/` returns **401**: the SPA shell is behind
      `anyRequest().authenticated()`, and there is no fallback route, so every client-side URL
      (`/messages/1`, `/listings/2`) is a 401 too. Item 13 below.

- [x] **The typefaces.** All three were declared in `tokens.css` and never loaded — no `<link>`,
      no `@font-face`, no files — so the app rendered in Georgia, system-ui and Consolas from
      phase 0 until now. Self-hosted rather than linked from Google's CDN, on the precedent
      `ambience.ts` sets about third-party origins. Six woff2 files, `latin` and `latin-ext` per
      family, split by `unicode-range` so `latin-ext` is fetched only when a page needs it; DM Sans
      is variable, covering 400, 500 and 700 in one file. `font-display: swap` throughout, and only
      the display face's `latin` slice is preloaded, since the headline is the text a swap is most
      visible on. Verified in the browser: all three load and apply, and JetBrains Mono is fetched
      only once something price-shaped is on screen.

- [ ] **A dead API is a blank page.** The router guard awaits `auth.bootstrap()`, and the store
      deliberately re-throws anything that is not a 401 so that "the API is down" surfaces rather
      than masquerading as "signed out". Nothing catches it, so navigation never resolves and the
      app renders the header and nothing else — no message, no retry. Every view already has the
      copy for this; the guard just never reaches one. Found by loading the app with the backend
      stopped.

Not attempted: reduced motion could not be *emulated* in the browser pane, so that fix is verified
by reading the cascade rather than by watching it. Nothing image-shaped was checked at all — see
item 11.

---

## Motion spec

Tokens live in `src/assets/tokens.css`. Direction changes the palette; it does not change how
things move.

| Token | Curve | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | Anything entering or exiting. The default. |
| `--ease-in-out` | `cubic-bezier(.77,0,.175,1)` | Elements moving or morphing on screen. |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | The mobile drawer only. |

**Never `ease-in` on UI** — it delays the first frame, exactly when the user is looking hardest, so
the same duration *feels* slower.

Durations: press `100–160ms`, tooltips `125–200ms`, dropdowns `150–250ms`, overlays `200–350ms`,
photographic scale `600ms` (slow on purpose — it should read as the image breathing).

**What does not animate:** search / command palette (keyboard-initiated, high frequency — animation
on a repeated action reads as lag); filter chips (the grid is what answers the press); pagination.

**Details that compound:** every pressable takes `scale(.97)` on `:active`; never enter from
`scale(0)` — start at `.95` with `opacity: 0`; popovers scale from their trigger, modals stay
centred; only `transform` and `opacity`; gate hover behind
`@media (hover:hover) and (pointer:fine)`; reduced motion means gentler, not none.

---

## What the API cannot do yet

Roadmap items with no endpoint behind them, plus the places where the shape that exists makes the
client guess. Each is a small backend change; none can be worked around from this side, and each is
listed with what would unblock it.

1. **No unpublish.** `PATCH /products/{id}/activate` only sets `active = true`, and the only way
   down is `DELETE`, which soft-deletes with nothing to undo it. A seller who wants a listing off
   browse for a fortnight has to destroy it. *Needs:* a deactivate verb, or `active` on
   `UpdateProductRequest`.
2. **No way to name an existing photograph.** Deleting one needs an image id; ids come back only
   from the upload response, and the gallery arrives as bare URLs on the detail shape. So a
   picture added last week can be seen and not removed. *Needs:* `GET /products/{id}/images`, or
   ids alongside the URLs on the detail response.
3. **No image reorder.** Position is assigned on append and nothing changes it, so the cover photo
   is whichever went up first. *Needs:* a position endpoint. Worth having after (2), since a
   reorder UI needs ids for the same reason a delete does.
4. **Descending price sorts are unsafe.** Nothing pins where nulls land, and Postgres puts them
   first descending — so "price, high to low" would open with every rent-only listing. *Needs:*
   `NULLS LAST` on the descending case, the same trap `ChatRepository` already dodges by
   coalescing. Then add the two options to `SORT_OPTIONS`.
5. **An inbox row cannot name anything.** `ChatResponse` is ids only, so the client resolves the
   counterparty and the listing itself (`src/lib/directory.ts`, memoised per session). Sound
   reasoning on the server — nesting the user would leak a password hash — but the shape leaves a
   row with nothing a person recognises. *Needs:* `counterpartyName` and `productName` on the
   summary, at which point that file can be deleted.
6. **Reviews cannot be read at all.** `POST /reviews` is the whole feature — no received reviews,
   no aggregate rating, no way to ask whether you have already reviewed somebody. Two consequences:
   the "one per direction per pair" gate can only be guessed at from a `localStorage` memo, and
   **a profile page is unbuildable**, since the two things it would exist to show are the two that
   do not exist. *Needs:* `GET /users/{id}/reviews` and a rating on `UserResponse`.
7. **The wishlist does not filter withdrawn listings.** `findWishlistOf` has no `deleted` clause,
   so a saved card can point at a boat whose detail page 404s, and nothing on the browse shape says
   which. *Needs:* the same `not deleted` filter every other read path has — or, if keeping the row
   is deliberate, a flag saying so.
8. **Three refusals are written for a log, not a person.** "User 3 has already reviewed user 7",
   the never-negotiated message, and "User 3 already has an unreviewed report against user 7" all
   reach the person who just filled in the form, because `detail` is what the client shows.
   Everywhere else in this API that copy is good. The report one is worked around — it is the only
   `detail` this client suppresses, replaced with written copy — which is a patch over a string,
   and it will drift. *Needs:* names, or second-person phrasing.

9. **An admin cannot see why an account is off.** `UserResponse.isActive` collapses deactivated,
   banned and closed into one boolean — deliberately, and the DTO comment says the distinction
   "gets added" once an admin surface exists. It exists now. The staff directory offers Ban and
   Unban side by side because a toggle would have to guess which state a row is in. *Needs:* the
   three flags, or a status enum, on `UserResponse` — or a separate admin-only shape, if telling
   every caller who has been banned is the thing being avoided.
10. **`GET /users` is unpaged.** The whole table in one response, so the directory searches what it
    already holds. Bounded by how many accounts exist, which is the one collection here that has no
    natural ceiling. *Needs:* a `PageResponse` and a `?name=` filter, the same shape browse has.
11. **Uploaded images are unreachable in the default store.** `InMemoryImageStore` keeps bytes in
    a map and hands out `http://localhost:8080/local-images/<key>`, but nothing serves that path —
    no resource handler — and `anyRequest().authenticated()` answers **401** for it besides. The
    URL is absolute, so it bypasses the dev proxy too. Uploads succeed and nothing renders, which
    means the browse cards, the gallery, avatars and the photo manager cannot be checked locally
    at all. *Needs:* a resource handler plus a `permitAll` for the path — or an honest admission
    that `memory` is test-only and dev should run `oci`.
12. **No bootstrap path.** `accountType` is never settable through the API, so the first admin is
    made with SQL; and nothing can be listed until a category exists, which only an admin can
    create. A fresh database therefore cannot reach a usable state without a hand-written UPDATE.
    *Needs:* a seed profile, or a first-run rule that promotes the first account.
13. **The SPA cannot be served same-origin yet.** `/` returns 401 — the shell is behind
    `anyRequest().authenticated()` — and there is no SPA fallback, so a deep link is a 401 rather
    than index.html. *Needs:* `permitAll` for `/`, `/index.html`, `/assets/**` and `/favicon.ico`,
    plus a forward for unmatched non-API paths that does **not** swallow the API's own 404s. Until
    then the only way to run this is the dev proxy, which the roadmap is explicit is not a
    deployment.
14. **Not every error is a `ProblemDetail`.** A malformed request body raises
    `HttpMessageNotReadableException`, which `GlobalExceptionHandler` does not handle, so the
    client gets Spring's default error shape — `timestamp`/`error`/`path`, no `detail` — **with a
    full stack trace in it**. `ApiError` degrades to "Request failed with status 400", which is
    survivable; the stack trace reaching a browser is less so. *Needs:* a handler for it, and
    `server.error.include-stacktrace: never`.

## Open questions

1. **Currency.** `Product` has no currency field; every price is a bare decimal. The client
   assumes EUR. Needs a column, or a documented single-currency platform. Still open.
2. ~~**HEIC uploads.**~~ **Settled: rejected at the picker**, on both the avatar (`de137ba`) and
   listing photographs (`584fa60`), with a sentence naming the iPhone setting to change.
   Converting in-browser would mean shipping a HEIC decoder — browsers do not have one — and
   several hundred kilobytes of dependency to rescue a file the owner can re-export in two taps is
   the wrong trade. The check lives in `src/lib/image-upload.ts`, once, for both surfaces.

## Constraints worth re-reading before each phase

- The dev proxy is **dev only**. Production serves the SPA same-origin.
- `BOTH` listings appear under *both* the sale and rent filters. Expected.
- A withdrawn listing 404s, but chats about it still open.
- Rate limits return 429 with `Retry-After` — disable and count down rather than letting the user
  retry into another refusal.
- Blocking and the wishlist have no retirement gate on the server; that is deliberate.
- **`null` on a PATCH means "leave unchanged" everywhere**, so no field can be cleared by sending
  one. Where clearing has to happen — a price the listing type no longer uses — the server does it
  and the client's job is to omit the field.
- **Timestamps carry no zone.** Jackson writes `LocalDateTime` as `2026-09-04T14:23:05`, which
  JavaScript reads as local time, so a UTC container and a reader an hour ahead of it disagree.
  Parsing lives in one function (`src/lib/chats.ts`), and nothing renders a future.
- **The stack has now been run end to end** (2026-09-04, backend `37e2cd7`), and four assumptions
  the client was built on are confirmed rather than inferred: `PageResponse` is flat exactly as
  mirrored; prices arrive as bare JSON numbers (`"price":128000.50`); `LocalDateTime` arrives
  zoneless with **microsecond** precision (`2026-09-04T23:03:31.664586`), which `new Date()` parses
  as local time without complaint; and the `XSRF-TOKEN` / `JSESSIONID` pair survives the Vite
  proxy, with `GET /auth/me` answering 401 for a signed-out visitor as the auth store expects.
  What has **not** been exercised is anything image-shaped — see item 11 — and no screen has been
  driven through a browser yet, only the wire. See [README.md](README.md) for how to run it.
