import { describe, expect, it } from 'vitest'

import { activeCount, emptyFilters, toQuery } from '../browse-filters'

/**
 * What matters here is the boundary between "the user left this alone" and "the user asked for
 * this". An empty field that reaches the API as `minPrice=` is a bind error rather than an
 * ignored parameter, so the dropping is the behaviour worth pinning down.
 */

describe('emptyFilters', () => {
  it('starts with nothing set', () => {
    expect(activeCount(emptyFilters())).toBe(0)
  })

  it('sends no parameters at all', () => {
    const query = toQuery(emptyFilters())
    expect(Object.values(query).every((value) => value === undefined)).toBe(true)
  })
})

describe('activeCount', () => {
  it('counts each half of a range separately', () => {
    const filters = { ...emptyFilters(), minPrice: '10000', maxPrice: '50000' }
    expect(activeCount(filters)).toBe(2)
  })

  it('counts a zero as set', () => {
    // The server accepts 0 as a filter bound even though no listing can be priced there, so a
    // typed 0 is a real narrowing and has to survive.
    expect(activeCount({ ...emptyFilters(), minPrice: '0' })).toBe(1)
  })

  it('counts a category chosen by id', () => {
    expect(activeCount({ ...emptyFilters(), categoryId: 3 })).toBe(1)
  })
})

describe('toQuery', () => {
  it('drops the fields that were left alone', () => {
    const query = toQuery({ ...emptyFilters(), listingType: 'FOR_RENT' })

    expect(query.listingType).toBe('FOR_RENT')
    expect(query.name).toBeUndefined()
    expect(query.minPrice).toBeUndefined()
    expect(query.categoryId).toBeUndefined()
  })

  it('trims the name, and drops it when only whitespace was typed', () => {
    expect(toQuery({ ...emptyFilters(), name: '  halcyon  ' }).name).toBe('halcyon')
    expect(toQuery({ ...emptyFilters(), name: '   ' }).name).toBeUndefined()
  })

  it('keeps the two price ranges apart', () => {
    const query = toQuery({
      ...emptyFilters(),
      minPrice: '50000',
      maxPricePerDay: '400',
    })

    expect(query).toMatchObject({ minPrice: '50000', maxPricePerDay: '400' })
    expect(query.maxPrice).toBeUndefined()
    expect(query.minPricePerDay).toBeUndefined()
  })

  it('passes a zero bound through rather than treating it as unset', () => {
    expect(toQuery({ ...emptyFilters(), minPrice: '0' }).minPrice).toBe('0')
  })
})
