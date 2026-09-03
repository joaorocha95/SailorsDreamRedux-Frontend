import type { ProductResponse } from '@/types/api'

/**
 * How prices are written.
 *
 * The API has no currency field — every price is a bare decimal — so euro is an assumption this
 * client makes, not something the server told it. Keeping the assumption in one module means
 * there is one place to change when it becomes a real decision: either a currency column on the
 * product, or a documented single-currency platform.
 *
 * No fraction digits: a boat costing 128,000 and one costing 128,000.00 are the same boat, and
 * the zeros cost two characters of a card's width for nothing.
 */
const money = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatPrice(value: number): string {
  return money.format(value)
}

export function formatDayRate(value: number): string {
  return `${money.format(value)} / day`
}

/**
 * The single price a card shows.
 *
 * Which price applies follows from the listing type, and on a listing offered both ways the sale
 * price is the headline. Tested against null rather than for truthiness: these are numbers, so a
 * 0 would read as "no price" and fall through to the dash. The server rejects a non-positive
 * price, so that cannot happen today — but the guard should not be the thing standing between us
 * and it.
 */
export function priceLabel(listing: ProductResponse): string {
  if (listing.price != null) return formatPrice(listing.price)
  if (listing.pricePerDay != null) return formatDayRate(listing.pricePerDay)
  return '—'
}
