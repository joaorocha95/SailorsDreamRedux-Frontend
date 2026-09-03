import type { ListingType } from '@/types/api'

/**
 * The browse filter form's state, and the translation from it to query parameters.
 *
 * Kept apart from the components because it is the part with rules in it: which fields count as
 * set, and which of them the server will accept. `GET /products` binds `ProductSearchCriteria`
 * straight off the query string, so a parameter name here is an API name, not a local one.
 *
 * Every field is a string (or the empty string) rather than a number or an enum, because that is
 * what a form control holds. An empty field means "don't filter on this" and is dropped on the
 * way out — sending `minPrice=` would be a bind error, not an ignored parameter.
 */
export interface BrowseFilters {
  name: string
  categoryId: number | ''
  listingType: ListingType | ''
  /** Bounds the sale price. Null-priced (rent-only) listings drop out for free. */
  minPrice: string
  maxPrice: string
  /**
   * Bounds the day rate. Deliberately a second pair rather than one range applied to whichever
   * price a listing happens to use: a 210,000 sale price and a 720 day rate are different units,
   * and one slider spanning both would compare nothing meaningful.
   */
  minPricePerDay: string
  maxPricePerDay: string
}

export function emptyFilters(): BrowseFilters {
  return {
    name: '',
    categoryId: '',
    listingType: '',
    minPrice: '',
    maxPrice: '',
    minPricePerDay: '',
    maxPricePerDay: '',
  }
}

/** How many filters are set, for the disclosure button. The two halves of a range count separately. */
export function activeCount(filters: BrowseFilters): number {
  return Object.values(filters).filter((value) => value !== '').length
}

/**
 * The query parameters for `GET /products`.
 *
 * Empty fields become `undefined` rather than being passed through as empty strings. The HTTP
 * client drops both, but saying it here means the omission is this module's decision and is
 * visible in its tests, rather than a behaviour inherited from the layer underneath.
 */
export function toQuery(filters: BrowseFilters): Record<string, string | number | undefined> {
  const set = <T extends string | number>(value: T | '') => (value === '' ? undefined : value)

  return {
    name: set(filters.name.trim()),
    categoryId: set(filters.categoryId),
    listingType: set(filters.listingType),
    minPrice: set(filters.minPrice),
    maxPrice: set(filters.maxPrice),
    minPricePerDay: set(filters.minPricePerDay),
    maxPricePerDay: set(filters.maxPricePerDay),
  }
}
