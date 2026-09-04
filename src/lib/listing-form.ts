import type {
  CreateProductRequest,
  ListingType,
  ProductResponse,
  UpdateProductRequest,
} from '@/types/api'

/**
 * The listing form, and the price rules that make it the most particular form in the app.
 *
 * A listing's prices are conditional on what it is offering: `price` for `FOR_SALE`,
 * `pricePerDay` for `FOR_RENT`, both for `BOTH`. The server treats the two directions
 * differently, and the difference is the whole reason this module exists:
 *
 *  - **Missing** a price the type requires is a 400.
 *  - **Sending** a price the type has no use for is *also* a 400 — rejected, not ignored, because
 *    silently discarding a number somebody deliberately typed hides a real misunderstanding about
 *    what they are listing.
 *
 * On a PATCH that second rule has a sharp edge. Null means "leave unchanged", so there is no way
 * to clear a price from the client at all: switching `BOTH` to `FOR_SALE` works by simply *not
 * sending* a day rate, and the server clears the stale one itself. A body that helpfully carried
 * the old value along would be refused.
 *
 * Every field here is a string, because that is what a form control holds. An empty one means the
 * field was left alone.
 */

export interface ListingForm {
  name: string
  description: string
  categoryId: number | ''
  listingType: ListingType | ''
  price: string
  pricePerDay: string
}

export function emptyListingForm(): ListingForm {
  return {
    name: '',
    description: '',
    categoryId: '',
    listingType: '',
    price: '',
    pricePerDay: '',
  }
}

/** The form for a listing that already exists, so an edit can tell what actually changed. */
export function formFrom(listing: ProductResponse): ListingForm {
  return {
    name: listing.name,
    description: listing.description,
    categoryId: listing.categoryId ?? '',
    listingType: listing.listingType,
    // A null price is a field this listing's type does not use, not a zero.
    price: listing.price == null ? '' : String(listing.price),
    pricePerDay: listing.pricePerDay == null ? '' : String(listing.pricePerDay),
  }
}

/** `BOTH` counts as each of them, the same way it matches either browse filter. */
export function usesSalePrice(type: ListingType | ''): boolean {
  return type === 'FOR_SALE' || type === 'BOTH'
}

export function usesDayRate(type: ListingType | ''): boolean {
  return type === 'FOR_RENT' || type === 'BOTH'
}

/**
 * Which price a type change is about to discard.
 *
 * The roadmap asks for this to be *shown* happening rather than left to the server, and it is
 * worth showing: the seller typed that number, and watching the field leave is what explains why
 * the listing no longer carries it. Only reports a price that is actually there — dropping an
 * empty field is not an event.
 */
export function clearedByChangingTypeTo(
  form: ListingForm,
  next: ListingType | '',
): 'price' | 'pricePerDay' | null {
  if (form.price !== '' && !usesSalePrice(next)) return 'price'
  if (form.pricePerDay !== '' && !usesDayRate(next)) return 'pricePerDay'
  return null
}

/**
 * A price as the server will read it.
 *
 * `null` for anything that is not a positive finite number, which folds three cases the form can
 * produce — empty, half-typed ("1e", "-"), and a zero the server rejects — into the single
 * question the caller has: is there a usable figure here.
 */
function parsePrice(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export interface ListingProblems {
  name?: string
  description?: string
  categoryId?: string
  listingType?: string
  price?: string
  pricePerDay?: string
}

/**
 * Everything the server would refuse, found before spending a request on it.
 *
 * Deliberately not a mirror of every server-side constraint — the point is to catch what the form
 * can produce, and to let `ProblemDetail` speak for anything subtler. The 255-character caps are
 * here because they are also what the `maxlength` attributes enforce, and a rule stated in two
 * places should at least be the same rule.
 */
export function listingProblems(form: ListingForm): ListingProblems {
  const problems: ListingProblems = {}

  if (form.name.trim() === '') problems.name = 'A listing needs a name.'
  else if (form.name.length > 255) problems.name = 'Names are limited to 255 characters.'

  if (form.description.trim() === '') problems.description = 'Say something about the boat.'
  else if (form.description.length > 255) {
    problems.description = 'Descriptions are limited to 255 characters.'
  }

  if (form.categoryId === '') problems.categoryId = 'Choose a category.'
  if (form.listingType === '') problems.listingType = 'Choose whether this is for sale or for rent.'

  // Only the price the chosen type actually uses is required — and the other one is not merely
  // optional, it is unsendable. See `toUpdateBody`.
  if (usesSalePrice(form.listingType) && parsePrice(form.price) === null) {
    problems.price = 'A sale price is required, and must be more than zero.'
  }
  if (usesDayRate(form.listingType) && parsePrice(form.pricePerDay) === null) {
    problems.pricePerDay = 'A day rate is required, and must be more than zero.'
  }

  return problems
}

export function hasProblems(problems: ListingProblems): boolean {
  return Object.keys(problems).length > 0
}

/**
 * The body for `POST /products`.
 *
 * A price the type has no use for is omitted rather than sent as null: `undefined` keys do not
 * survive `JSON.stringify`, so the field genuinely does not appear on the wire, which is what the
 * server's applicability check is testing for.
 *
 * Call only on a form that {@link listingProblems} passed. A price that failed validation falls
 * out as `undefined` here rather than as a zero, so the worst a mis-sequenced caller gets is the
 * server's own "a price is required" — never a listing quietly priced at nothing.
 */
export function toCreateBody(form: ListingForm): CreateProductRequest {
  const type = form.listingType as ListingType

  return {
    categoryId: Number(form.categoryId),
    name: form.name.trim(),
    description: form.description.trim(),
    listingType: type,
    price: usesSalePrice(type) ? (parsePrice(form.price) ?? undefined) : undefined,
    pricePerDay: usesDayRate(type) ? (parsePrice(form.pricePerDay) ?? undefined) : undefined,
  }
}

/**
 * The body for `PATCH /products/{id}` — only what changed, and never a price the new type has no
 * use for.
 *
 * Two rules are doing the work here, and they interact:
 *
 *  1. **Omit what did not change.** Null means "leave unchanged", so re-asserting an untouched
 *     field is noise at best. It is not harmless noise for the prices, though — see below.
 *  2. **Omit any price the resulting type does not use, changed or not.** This is what makes a
 *     type change possible at all. Switching `BOTH` to `FOR_SALE` while carrying the old day rate
 *     along is a 400; leaving it out lets the server clear it, which is the only way it can be
 *     cleared.
 *
 * A price that becomes newly required is covered by rule 1 without a special case: the listing's
 * old value is null, the form's is a number, so they differ and it is sent.
 */
export function toUpdateBody(form: ListingForm, original: ProductResponse): UpdateProductRequest {
  const type = form.listingType as ListingType
  const name = form.name.trim()
  const description = form.description.trim()
  const categoryId = Number(form.categoryId)

  const salePrice = parsePrice(form.price)
  const dayRate = parsePrice(form.pricePerDay)

  return {
    name: name === original.name ? undefined : name,
    description: description === original.description ? undefined : description,
    categoryId: categoryId === original.categoryId ? undefined : categoryId,
    listingType: type === original.listingType ? undefined : type,
    // `?? undefined` rather than a cast: a null here would mean the form failed validation, and
    // omitting the field is the safe reading of that — the server leaves the price unchanged
    // instead of being handed a null it would treat as "no opinion" anyway.
    price:
      usesSalePrice(type) && salePrice !== original.price ? (salePrice ?? undefined) : undefined,
    pricePerDay:
      usesDayRate(type) && dayRate !== original.pricePerDay ? (dayRate ?? undefined) : undefined,
  }
}

/** Whether a PATCH would carry anything at all, so an unchanged form does not spend a request. */
export function isUnchanged(body: UpdateProductRequest): boolean {
  return Object.values(body).every((value) => value === undefined)
}
