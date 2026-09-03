# Contract invariants

Rules the server enforces that a TypeScript type cannot express. Each one is a way a plausible
client is wrong. Sources: `ROADMAP.md` and the backend's `docs/reference.html`.

## Products

- **`imageUrls` means two different things.** Browse (`GET /products`) sends
  `primaryImageUrl` with `imageUrls: null`; detail (`GET /products/{id}`) sends the full ordered
  array, `[]` when the listing has no photographs. The null says *this response does not carry the
  gallery* — not *there are no images*. A gallery must be built from the detail response.
- **Prices are conditional on `listingType`.** `price` for `FOR_SALE`, `pricePerDay` for
  `FOR_RENT`, both for `BOTH`. Sending a price the type has no use for is **rejected, not
  ignored**.
- **On a PATCH, `null` means "leave unchanged".** So changing the listing type is what clears the
  price that no longer applies — the server does it, and the UI should show it happening rather
  than leaving a stale figure on screen.
- **Sorting accepts `id`, `name`, `price`, `pricePerDay` and nothing else.** Any other property is
  a 400. `SORTABLE_PRODUCT_FIELDS` in `api.ts` is the list; sort controls must be built from it.
- **Two price ranges, never one.** A sale price and a day rate are different quantities. Each pair
  also excludes listings whose column is null, so filtering by day rate cannot return a sale-only
  listing.
- **`BOTH` listings appear under both the sale and the rent filter.** Expected, not a bug.
  Filtering by `BOTH` matches only `BOTH`.
- **`includeInactive=true` requires `sellerId` to be your own id.** Anything else is a 403, so the
  drafts view must always send both.
- **A withdrawn listing 404s, but chats about it still open.** The thread header needs a "no longer
  listed" treatment; it must not fail on the missing listing.
- **`categoryId` is null for an unfiled listing** — one whose category was deleted. A normal state,
  not an error. Deleting a category unfiles its listings rather than deleting them.
- **Eight images maximum.** Disable the picker at 8; the 9th is a 409.
- **JPEG and PNG only.** HEIC is still an open question — convert on a canvas or reject at the
  picker, but never let it silently 400.

## Accounts

- **A self-deactivated user can still sign in.** Deliberate: reactivating requires being
  authenticated. Show a way back, do not lock them out.
- **Banned and closed accounts return distinct 403s.** Keep the messages distinct too.
- **Profile edit covers name and phone only.**
- **Signup is IP-rate-limited**: 429 with `Retry-After`. Disable the control and count down rather
  than letting the user retry into another refusal. `ApiError.retryAfterSeconds` carries this.

## Chats

- **Opening a thread does not mark it read.** `PATCH /chats/{id}/read` is explicit.
- **`unreadCount` is per viewer**, not per thread; your own messages never count.
- **`messages` is null on the inbox summary** and populated on the single-thread view — the same
  distinction as `imageUrls`.
- **A blocked thread leaves both inboxes, but `GET /chats/{id}` still works.** A bookmarked URL
  loads a readable, un-postable thread. That state needs a design.
- **There are no websockets.** Poll at 20–30s, pause while the tab is hidden, refetch on focus.

## Reviews, blocks and reports

- **A review is gated on a shared chat**, one per direction per pair. Only offer it where it will
  succeed.
- **One unreviewed report per pair.** Explain the refusal rather than surfacing a raw 400.
- **Blocking and the wishlist have no retirement gate.** Deliberate.

## Everywhere

- **Errors are RFC 7807 `ProblemDetail`.** `detail` is written for a person to read — show it.
- **Money is a decimal string on the wire.** Never parse it into a `number` to display or compare.
- **The `/api` prefix and the dev proxy are development only.** Production serves the built SPA
  same-origin with the API; the cookie session and CSRF double-submit both assume that.
