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

## Phase 6 — Safety &nbsp;·&nbsp; next

The thread already has an actions strip sized for these two, and `GET /blocks` is wired for the
blocked-thread state.

- [ ] Block and unblock from a thread or a profile.
- [ ] Report, with the reason enum and optional detail. One unreviewed report per pair, so explain
      the refusal rather than showing a raw 400.

## Phase 7 — Admin

Can be plain. Nobody needs it to be beautiful.

- [ ] Category maintenance; deleting one unfiles its listings rather than deleting them.
- [ ] Report queue (oldest first — it is a work queue) and mark-reviewed.
- [ ] Ban/unban; user directory.

## Phase 8 — Polish

Not the phase to skip. This is where it starts feeling expensive.

- [ ] Motion pass against the spec below.
- [ ] Focus order, labels, live regions on async states.
- [ ] `prefers-reduced-motion` audit.
- [ ] Production build served same-origin — the proxy is dev only.

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
8. **Two review refusals are written for a log, not a person.** "User 3 has already reviewed user
   7" and the never-negotiated message both reach the person who just filled in the form, because
   `detail` is what the client shows. Everywhere else in this API that copy is good. *Needs:* names,
   or second-person phrasing.

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
- **Nothing has been run against a live backend yet.** Every phase so far is verified by
  type-check, unit tests and build, with the wire shapes read from the Java source. The first end
  to end run will find things.
