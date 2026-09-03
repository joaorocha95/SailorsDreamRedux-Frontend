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

## Phase 1 — Browse &nbsp;·&nbsp; next

Entirely guest-visible, so it needs no session and is the best next slice.

- [ ] Filter panel wired to `ProductSearchCriteria` — name, category, listing type.
- [ ] **Two separate price ranges.** A sale price and a day rate are not comparable; never one
      slider. Each pair also excludes listings whose column is null for free.
- [ ] Sort control offering **only** `id`, `name`, `price`, `pricePerDay`. Anything else is a 400.
- [ ] Pagination over `PageResponse`. Stagger the grid on **first paint only** — re-staggering
      every page turn makes page 4 feel slower than page 1.
- [ ] Category list from `GET /categories` (guest-readable).
- [ ] Listing detail: gallery from the *detail* response shape (`imageUrls` is an array here, null
      on browse), seller line, "Message the owner" CTA.
- [ ] Mobile filter drawer — `vaul-vue`, `--ease-drawer`.
- [ ] **Harbour ambience** on browse: opt-in, off by default, remembered, fades in, suspends on
      `visibilitychange`. Ship a real field recording from our own origin, not the synthesised
      demo. Keep it off detail and thread views.
- [ ] Empty, loading and error states for each.

## Phase 2 — Identity

- [ ] Signup form (`POST /users`), honouring the IP-keyed quota's 429 + `Retry-After`.
- [ ] **Deactivated-account screen.** A self-deactivated user *can* sign in — that is deliberate
      server-side, because reactivating requires being authenticated. Offer a way back, don't lock
      them out.
- [ ] Banned and closed accounts get distinct 403 messages; don't collapse them into one.
- [ ] Profile edit (name, phone only) and profile picture upload.
- [ ] Account closure flow, with the irreversibility stated plainly before confirming.

## Phase 3 — Negotiation

The other half of the product.

- [ ] Inbox: paged, newest activity first, per-viewer unread counts.
- [ ] Thread view; `PATCH /chats/{id}/read` is explicit — opening does not mark read.
- [ ] Composer. `<TransitionGroup>` with **CSS transitions, not keyframes** — messages arrive in
      bursts and transitions retarget mid-flight.
- [ ] Polling: 20–30s, **paused when the tab is hidden**, refetch on focus. No websockets exist.
- [ ] **Blocked-thread state.** A blocked thread leaves both inboxes but `GET /chats/{id}` still
      works, so a bookmarked URL loads a readable, un-postable thread. Design that.
- [ ] **Withdrawn-listing state.** The listing 404s but the chat still opens — the header needs a
      "no longer listed" treatment.

## Phase 4 — Selling

The most complex forms in the app.

- [ ] Create/edit listing with **conditional price fields** driven by `listingType`: `price` for
      `FOR_SALE`, `pricePerDay` for `FOR_RENT`, both for `BOTH`. A price the type has no use for is
      rejected, not ignored.
- [ ] Changing the type clears the price that no longer applies — on a PATCH, null means "leave
      unchanged", so the server does this and the UI should show it happening.
- [ ] Image upload: cap of 8 (disable the picker at 8; the 9th is a 409), reorder, delete.
- [ ] **HEIC.** JPEG and PNG only — decide: convert on a canvas, or reject at the picker. See
      *Open questions*.
- [ ] Publish/unpublish toggle; drafts view via `includeInactive=true` **with `sellerId` = you**
      (anything else is a 403).

## Phase 5 — Wishlist and reviews

- [ ] Save/unsave from the card and the detail page; wishlist page in the browse shape.
- [ ] Leave a review. Gated on a shared chat, so only offer it where it will succeed — one per
      direction per pair.

## Phase 6 — Safety

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

## Open questions

1. **Currency.** `Product` has no currency field; every price is a bare decimal. The client
   assumes EUR. Needs a column, or a documented single-currency platform.
2. **HEIC uploads.** Convert in-browser, or reject with a clear message at the picker? Silently
   400-ing an iPhone photo is the worst of the three.

## Constraints worth re-reading before each phase

- The dev proxy is **dev only**. Production serves the SPA same-origin.
- `BOTH` listings appear under *both* the sale and rent filters. Expected.
- A withdrawn listing 404s, but chats about it still open.
- Rate limits return 429 with `Retry-After` — disable and count down rather than letting the user
  retry into another refusal.
- Blocking and the wishlist have no retirement gate on the server; that is deliberate.
