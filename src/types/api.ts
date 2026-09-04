/**
 * Wire types, mirroring the backend's DTO records.
 *
 * Hand-written rather than generated: the API has no OpenAPI document served at runtime (the
 * spec in the wiki describes the original design, not this implementation), so there is nothing
 * to generate from. If a `/v3/api-docs` endpoint is ever added, replace this file with a
 * generated client rather than maintaining both.
 *
 * Keep these in step with `domain/dto` in the backend.
 */

/** RFC 7807. Every error the API returns has this shape. */
export interface ProblemDetail {
  type?: string
  title?: string
  status?: number
  /** Written for a person to read. This is the string to show. */
  detail?: string
  instance?: string
}

/**
 * The wire shape of every paged endpoint — deliberately flat, with no nested `pageable` object.
 * `page` is zero-based.
 */
export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export type ListingType = 'FOR_SALE' | 'FOR_RENT' | 'BOTH'
export type AccountType = 'USER' | 'ADMIN' | 'SUPPORT'
export type ReportReason = 'HARASSMENT' | 'SPAM' | 'SCAM' | 'INAPPROPRIATE_CONTENT' | 'OTHER'

/**
 * A listing. Comes in two shapes from the same endpoint family:
 *
 *  - **browse** (`GET /products`) carries `primaryImageUrl` and `imageUrls: null`
 *  - **detail** (`GET /products/{id}`) carries the full ordered `imageUrls`, `[]` when empty
 *
 * The null is meaningful: it says this response does not carry the gallery, as opposed to the
 * listing having no photographs.
 */
export interface ProductResponse {
  id: number
  sellerId: number
  /** Null for an unfiled listing — one whose category was deleted. Normal, not an error state. */
  categoryId: number | null
  name: string
  description: string
  listingType: ListingType
  /**
   * Present for FOR_SALE and BOTH.
   *
   * A number, not a string. `BigDecimal` serialises as a bare JSON number under Jackson's
   * defaults, and the backend configures nothing that would change it — its own tests assert
   * `jsonPath("$.price").value(12000.00)`, which a quoted string would fail. Doubles are exact
   * for money well past any price this platform will carry, so this is safe to compare and sort
   * on directly; it would stop being safe if prices ever had to be summed at scale.
   */
  price: number | null
  /** Present for FOR_RENT and BOTH. Same wire type as `price`. */
  pricePerDay: number | null
  active: boolean
  primaryImageUrl: string | null
  imageUrls: string[] | null
}

export interface UserResponse {
  id: number
  name: string
  email: string
  phoneNumber: string
  profilePictureUrl: string | null
  accountType: AccountType
  /** One positive field derived from three separately stored flags on the server. */
  isActive: boolean
}

export interface CategoryResponse {
  id: number
  name: string
}

export interface MessageResponse {
  id: number
  authorId: number
  text: string
  read: boolean
  timestamp: string
}

export interface ChatResponse {
  id: number
  productId: number
  initiatorId: number
  /** Reached through the listing's seller; a chat row only stores its initiator. */
  sellerId: number
  createdAt: string
  lastMessageAt: string
  /** Per viewer, not per thread — your own messages never count. */
  unreadCount: number
  /** Null on the inbox summary; populated on the single-thread view. */
  messages: MessageResponse[] | null
}

export interface WishlistItemResponse {
  addedAt: string
  product: ProductResponse
}

/**
 * A block this user placed.
 *
 * `GET /blocks` lists only your own — there is deliberately no way to ask whether somebody has
 * blocked *you*, since answering that would tell a harasser exactly what they had been shut out
 * of. So a thread can know it is closed from your side before you write into it, and only learns
 * about the other direction from the 403 on the send.
 */
export interface BlockResponse {
  id: number
  blockerId: number
  blockedUserId: number
  createdAt: string
}

export interface ReviewResponse {
  id: number
  fromUserId: number
  toUserId: number
  rating: number
  comment: string | null
  createdAt: string
}

// --- Requests -----------------------------------------------------------------

export interface LoginRequest {
  email: string
  password: string
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  /** ISO date, and must be in the past. */
  birthDate: string
  phoneNumber: string
}

/**
 * Browse filters.
 *
 * Two separate price ranges because a purchase price and a day rate are different quantities and
 * cannot share a control. Each pair also excludes listings whose column is null for free, so
 * filtering by day rate cannot return a sale-only listing.
 */
export interface ProductSearchCriteria {
  name?: string
  categoryId?: number
  sellerId?: number
  /** FOR_SALE and FOR_RENT both match a BOTH listing; BOTH matches only BOTH. */
  listingType?: ListingType
  minPrice?: string
  maxPrice?: string
  minPricePerDay?: string
  maxPricePerDay?: string
  /** Requires `sellerId` to be your own id; anything else is a 403. */
  includeInactive?: boolean
}

/** The only properties the server will sort listings by. Anything else is a 400. */
export const SORTABLE_PRODUCT_FIELDS = ['id', 'name', 'price', 'pricePerDay'] as const
export type SortableProductField = (typeof SORTABLE_PRODUCT_FIELDS)[number]

// --- Wishlist and reviews -----------------------------------------------------

/**
 * Saving a listing. The owner is the session, never a body field.
 *
 * Both writes are **idempotent**: adding something already saved answers 201 with the existing
 * row, and removing something that was never there answers 204. The end state holds either way,
 * and on your own private list the distinction tells you nothing.
 *
 * There is no "is this saved?" endpoint — but `GET /wishlist` is unpaged, so the whole set
 * arrives in one request and the client can answer it from that.
 */
export interface AddToWishlistRequest {
  productId: number
}

/**
 * Leaving a review, which has more gates than any other write in the API:
 *
 *  - not yourself (400);
 *  - neither party retired (409) — a closed account cannot answer a review, and its rating would
 *    be attached to a name that no longer exists;
 *  - the two must **share a chat** (400). With no orders to anchor to, having negotiated at all is
 *    the only evidence that two people ever dealt with each other;
 *  - **one per direction per pair** (400).
 *
 * The last gate is the awkward one, because there are no read endpoints for reviews at all — not
 * yours, not anyone's — so a client cannot ask whether it has already reviewed somebody. See
 * `src/lib/reviewed.ts`.
 */
export interface CreateReviewRequest {
  toUserId: number
  /** 1 to 5, inclusive. */
  rating: number
  /** Optional, 255 characters. */
  comment?: string
}

// --- Selling ------------------------------------------------------------------

/**
 * One photograph on a listing.
 *
 * **Only ever returned from the upload.** There is no `GET /products/{id}/images` — the gallery
 * rides along on the detail response as bare URLs — so the `id` needed to delete a photograph
 * exists on the client only for photographs uploaded in that same session. An edit page opened
 * fresh can show the pictures and cannot name them.
 */
export interface ProductImageResponse {
  id: number
  productId: number
  /** Zero-based, and assigned by the server on append. Position 0 is the primary image. */
  position: number
  url: string
}

/**
 * Creating a listing.
 *
 * The seller is the session, never a field. Which price is required follows from `listingType`,
 * and it is a cross-field rule no per-field validation can express: `price` for `FOR_SALE`,
 * `pricePerDay` for `FOR_RENT`, both for `BOTH`. Sending one the type has no use for is
 * **rejected, not ignored** — a 400 rather than a silent drop, because discarding a number
 * somebody deliberately typed hides a real misunderstanding about what they are listing.
 *
 * A new listing is created **inactive**. It is invisible until `PATCH /products/{id}/activate`.
 */
export interface CreateProductRequest {
  categoryId: number
  name: string
  description: string
  listingType: ListingType
  /** Strictly positive — 0 is rejected. Omitted entirely when the type has no use for it. */
  price?: number
  pricePerDay?: number
}

/**
 * Editing a listing. Every field optional, and **null means "leave unchanged"**.
 *
 * Which makes the price rules subtler than they look on create. The server judges what the
 * caller *sent* for applicability, and what the listing *becomes* for completeness — so a PATCH
 * that switches `BOTH` to `FOR_SALE` must simply not carry a `pricePerDay`, and the server is
 * what clears the stale one. Sending it would be a 400; there is no way to null a field here.
 */
export interface UpdateProductRequest {
  categoryId?: number
  name?: string
  description?: string
  listingType?: ListingType
  price?: number
  pricePerDay?: number
}

// --- Negotiation --------------------------------------------------------------

/**
 * Opening a negotiation on a listing.
 *
 * The seller is never supplied — the server reads it off the product, so a thread cannot be
 * addressed to somebody who does not own the boat. `firstMessage` is required: an empty thread
 * is noise in a seller's inbox, and saying something is the whole point of opening one.
 *
 * `POST /chats` is idempotent. Messaging a seller about a listing you have already messaged them
 * about appends to the existing thread and still answers 201, so a returned chat may be one that
 * already existed — distinguishing the two would leak whether a thread was already there.
 */
export interface StartChatRequest {
  productId: number
  /** 255 characters, matching the column. Longer is a 400, not a truncation. */
  firstMessage: string
}

/**
 * Posting into an existing thread.
 *
 * The chat is in the path and the author is the session, so the text is all that travels.
 */
export interface SendMessageRequest {
  /** 255 characters, and `@NotBlank` — whitespace alone is a 400. */
  text: string
}
