import { describe, expect, it } from 'vitest'

import {
  activeCount,
  emptyFilters,
  hasRangeProblem,
  rangeProblems,
  toQuery,
} from '../browse-filters'

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

describe('rangeProblems', () => {
  it('catches a minimum above its maximum', () => {
    const filters = { ...emptyFilters(), minPrice: '90000', maxPrice: '40000' }
    expect(rangeProblems(filters).salePrice).toBe(true)
    expect(hasRangeProblem(filters)).toBe(true)
  })

  it('keeps the two ranges independent', () => {
    // An impossible day rate says nothing about the sale price the visitor also typed.
    const filters = {
      ...emptyFilters(),
      minPrice: '40000',
      maxPrice: '90000',
      minPricePerDay: '800',
      maxPricePerDay: '300',
    }
    expect(rangeProblems(filters)).toEqual({ salePrice: false, dayRate: true })
  })

  it('accepts a single bound, which can never contradict anything', () => {
    expect(hasRangeProblem({ ...emptyFilters(), minPrice: '90000' })).toBe(false)
    expect(hasRangeProblem({ ...emptyFilters(), maxPrice: '10' })).toBe(false)
  })

  it('accepts equal bounds', () => {
    expect(hasRangeProblem({ ...emptyFilters(), minPrice: '5000', maxPrice: '5000' })).toBe(false)
  })

  it('holds off while a number is still being typed', () => {
    // "1e" is mid-keystroke, not a contradiction. Complaining here would flash a message at
    // someone who is still typing the thing that resolves it.
    expect(hasRangeProblem({ ...emptyFilters(), minPrice: '1e', maxPrice: '40' })).toBe(false)
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
