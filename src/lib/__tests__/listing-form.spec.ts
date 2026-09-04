import { describe, expect, it } from 'vitest'

import {
  clearedByChangingTypeTo,
  emptyListingForm,
  formFrom,
  hasProblems,
  isUnchanged,
  listingProblems,
  toCreateBody,
  toUpdateBody,
  usesDayRate,
  usesSalePrice,
} from '../listing-form'
import type { ListingForm } from '../listing-form'
import type { ProductResponse } from '@/types/api'

/**
 * The rule under test is asymmetric, and that asymmetry is where a plausible client goes wrong.
 * Omitting a required price is an obvious 400. *Sending* a price the type has no use for is also
 * a 400 — and on a PATCH it is the failure that matters, because a form that helpfully posts back
 * everything it holds makes switching a listing's type impossible and the symptom is a refusal
 * that names a field the seller never touched.
 */

function form(overrides: Partial<ListingForm> = {}): ListingForm {
  return {
    ...emptyListingForm(),
    name: 'Petrel',
    description: 'A 1974 sloop, rigged and ready.',
    categoryId: 3,
    listingType: 'FOR_SALE',
    price: '128000',
    ...overrides,
  }
}

function listing(overrides: Partial<ProductResponse> = {}): ProductResponse {
  return {
    id: 9,
    sellerId: 1,
    categoryId: 3,
    name: 'Petrel',
    description: 'A 1974 sloop, rigged and ready.',
    listingType: 'FOR_SALE',
    price: 128000,
    pricePerDay: null,
    active: true,
    primaryImageUrl: null,
    imageUrls: [],
    ...overrides,
  }
}

describe('which prices a type uses', () => {
  it('counts BOTH as each of them', () => {
    expect(usesSalePrice('BOTH')).toBe(true)
    expect(usesDayRate('BOTH')).toBe(true)
  })

  it('keeps the two apart otherwise', () => {
    expect(usesSalePrice('FOR_RENT')).toBe(false)
    expect(usesDayRate('FOR_SALE')).toBe(false)
  })
})

describe('listingProblems', () => {
  it('passes a coherent sale listing', () => {
    expect(hasProblems(listingProblems(form()))).toBe(false)
  })

  it('requires only the price its type uses', () => {
    // A sale listing with no day rate is complete, not half-filled.
    expect(listingProblems(form({ pricePerDay: '' })).pricePerDay).toBeUndefined()
    expect(listingProblems(form({ listingType: 'FOR_RENT', price: '' })).pricePerDay).toBeDefined()
  })

  it('requires both on BOTH', () => {
    const problems = listingProblems(form({ listingType: 'BOTH', price: '128000' }))
    expect(problems.price).toBeUndefined()
    expect(problems.pricePerDay).toBeDefined()
  })

  it('rejects a zero, which the server rejects too', () => {
    // @DecimalMin(inclusive = false): a free boat is not something this marketplace offers, and a
    // 0 is far likelier to be an unset field than a giveaway.
    expect(listingProblems(form({ price: '0' })).price).toBeDefined()
  })

  it('rejects a half-typed number rather than sending NaN', () => {
    expect(listingProblems(form({ price: '1e' })).price).toBeDefined()
    expect(listingProblems(form({ price: '-' })).price).toBeDefined()
  })

  it('catches the empty required fields', () => {
    const problems = listingProblems(emptyListingForm())
    expect(problems.name).toBeDefined()
    expect(problems.description).toBeDefined()
    expect(problems.categoryId).toBeDefined()
    expect(problems.listingType).toBeDefined()
  })

  it('does not demand a price before a type has been chosen', () => {
    const problems = listingProblems(emptyListingForm())
    expect(problems.price).toBeUndefined()
    expect(problems.pricePerDay).toBeUndefined()
  })
})

describe('toCreateBody', () => {
  it('omits the price its type has no use for', () => {
    // Omitted, not null: undefined keys do not survive JSON.stringify, so the field genuinely
    // does not reach the server — which is what its applicability check is testing for.
    const body = toCreateBody(form({ listingType: 'FOR_SALE', pricePerDay: '650' }))
    expect(body.price).toBe(128000)
    expect(body.pricePerDay).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('pricePerDay')
  })

  it('carries both on BOTH', () => {
    const body = toCreateBody(form({ listingType: 'BOTH', pricePerDay: '650' }))
    expect(body.price).toBe(128000)
    expect(body.pricePerDay).toBe(650)
  })

  it('trims the text and sends the category as a number', () => {
    const body = toCreateBody(form({ name: '  Petrel  ', categoryId: 3 }))
    expect(body.name).toBe('Petrel')
    expect(body.categoryId).toBe(3)
  })
})

describe('toUpdateBody', () => {
  it('sends nothing when nothing changed', () => {
    const body = toUpdateBody(formFrom(listing()), listing())
    expect(isUnchanged(body)).toBe(true)
  })

  it('sends only the field that changed', () => {
    const body = toUpdateBody(form({ name: 'Petrel II' }), listing())
    expect(body.name).toBe('Petrel II')
    expect(body.description).toBeUndefined()
    expect(body.price).toBeUndefined()
  })

  /**
   * The one that matters. Switching away from a type must *drop* the price it no longer uses —
   * carrying the old value along is a 400, and since null means "leave unchanged" there is no
   * other way to clear it. The server does the clearing precisely because the client cannot.
   */
  it('drops the day rate when switching BOTH to FOR_SALE', () => {
    const both = listing({ listingType: 'BOTH', price: 128000, pricePerDay: 650 })
    const body = toUpdateBody(
      form({ listingType: 'FOR_SALE', price: '128000', pricePerDay: '650' }),
      both,
    )

    expect(body.listingType).toBe('FOR_SALE')
    expect(body.pricePerDay).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('pricePerDay')
  })

  it('drops the sale price when switching BOTH to FOR_RENT', () => {
    const both = listing({ listingType: 'BOTH', price: 128000, pricePerDay: 650 })
    const body = toUpdateBody(
      form({ listingType: 'FOR_RENT', price: '128000', pricePerDay: '650' }),
      both,
    )

    expect(body.listingType).toBe('FOR_RENT')
    expect(body.price).toBeUndefined()
  })

  it('sends a price that has become newly required', () => {
    // FOR_SALE to FOR_RENT: the listing has no day rate at all, so the typed one differs from
    // null and goes out without needing a case of its own.
    const body = toUpdateBody(
      form({ listingType: 'FOR_RENT', price: '128000', pricePerDay: '650' }),
      listing(),
    )
    expect(body.pricePerDay).toBe(650)
    expect(body.price).toBeUndefined()
  })

  it('sends a changed price when the type is unchanged', () => {
    const body = toUpdateBody(form({ price: '119000' }), listing())
    expect(body.price).toBe(119000)
    expect(body.listingType).toBeUndefined()
  })

  it('treats an unfiled listing as a category change once one is chosen', () => {
    // categoryId is null for a listing whose category was deleted — a normal state, and picking
    // one again is a real edit.
    const body = toUpdateBody(form({ categoryId: 5 }), listing({ categoryId: null }))
    expect(body.categoryId).toBe(5)
  })
})

describe('clearedByChangingTypeTo', () => {
  it('names the price a switch is about to discard', () => {
    const both = form({ listingType: 'BOTH', price: '128000', pricePerDay: '650' })
    expect(clearedByChangingTypeTo(both, 'FOR_SALE')).toBe('pricePerDay')
    expect(clearedByChangingTypeTo(both, 'FOR_RENT')).toBe('price')
  })

  it('says nothing when the switch discards nothing', () => {
    const both = form({ listingType: 'BOTH', price: '128000', pricePerDay: '650' })
    expect(clearedByChangingTypeTo(both, 'BOTH')).toBeNull()
    // An empty field being dropped is not an event worth announcing.
    expect(clearedByChangingTypeTo(form({ pricePerDay: '' }), 'FOR_SALE')).toBeNull()
  })
})

describe('formFrom', () => {
  it('reads a null price as an empty field, not a zero', () => {
    expect(formFrom(listing()).pricePerDay).toBe('')
    expect(formFrom(listing()).price).toBe('128000')
  })

  it('reads an unfiled listing as no category chosen', () => {
    expect(formFrom(listing({ categoryId: null })).categoryId).toBe('')
  })
})
