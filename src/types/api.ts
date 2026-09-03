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
  /** Present for FOR_SALE and BOTH. */
  price: string | null
  /** Present for FOR_RENT and BOTH. */
  pricePerDay: string | null
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
