import { describe, it, expect } from 'vitest'
import { cn, datetimeLocalToWallClockIso, toNumber, parseOptionalNumber } from '@/lib/utils'

describe('cn', () => {
  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })

  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500')
  })

  it('merges multiple classes', () => {
    expect(cn('px-4', 'py-2', 'rounded')).toBe('px-4 py-2 rounded')
  })

  it('deduplicates conflicting tailwind classes — last one wins', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('merges padding conflicts correctly', () => {
    expect(cn('p-4', 'px-2')).toBe('p-4 px-2')
  })

  it('overrides with more specific padding class', () => {
    // tailwind-merge: px-2 overrides the x-axis of p-4
    const result = cn('p-4', 'px-2')
    expect(result).toContain('px-2')
  })

  it('handles conditional classes — falsy values ignored', () => {
    expect(cn('base', false && 'hidden', null, undefined, 'extra')).toBe('base extra')
  })

  it('handles object syntax', () => {
    expect(cn({ 'font-bold': true, italic: false })).toBe('font-bold')
  })

  it('handles array syntax', () => {
    expect(cn(['px-4', 'py-2'])).toBe('px-4 py-2')
  })

  it('merges conditional object with string', () => {
    const isActive = true
    expect(cn('btn', { 'btn-active': isActive, 'btn-disabled': false })).toBe('btn btn-active')
  })

  it('deduplicates background color classes', () => {
    const result = cn('bg-white', 'bg-slate-900')
    expect(result).toBe('bg-slate-900')
  })

  it('handles empty string inputs', () => {
    expect(cn('', 'px-4', '')).toBe('px-4')
  })
})

describe('toNumber', () => {
  it('parses the Decimal strings the API actually sends', () => {
    // Backend Decimal fields serialise as strings even where the TS interface
    // declares number; adding them raw produced "ETBNaN" in the ledger totals.
    expect(toNumber('100000.00')).toBe(100000)
    expect(toNumber('-2500.50')).toBe(-2500.5)
  })

  it('passes real numbers through untouched', () => {
    expect(toNumber(42)).toBe(42)
    expect(toNumber(0)).toBe(0)
    expect(toNumber(-7.25)).toBe(-7.25)
  })

  it('treats missing and unparseable values as zero rather than NaN', () => {
    for (const bad of [null, undefined, '', 'abc', {} as unknown as string]) {
      expect(toNumber(bad as never)).toBe(0)
    }
  })

  it('sums mixed strings and numbers correctly', () => {
    const entries = [{ amount: '100000.00' }, { amount: -50000 }, { amount: '-25000.00' }]
    const total = entries.reduce((sum, e) => sum + toNumber(e.amount), 0)
    expect(total).toBe(25000)
    expect(Number.isNaN(total)).toBe(false)
  })
})

describe('parseOptionalNumber', () => {
  it('returns null for a cleared field rather than NaN', () => {
    // parseFloat('') is NaN, which would reach the backend as an invalid rate
    // instead of "no tier set for this vehicle".
    for (const empty of ['', '   ']) {
      expect(parseOptionalNumber(empty)).toBeNull()
    }
  })

  it('parses the tier rates the QA plan uses', () => {
    expect(parseOptionalNumber('9000')).toBe(9000)
    expect(parseOptionalNumber('32000')).toBe(32000)
    expect(parseOptionalNumber('1500.50')).toBe(1500.5)
  })

  it('keeps zero, which is a real rate and not an empty field', () => {
    expect(parseOptionalNumber('0')).toBe(0)
  })

  it('returns null for unparseable input instead of NaN', () => {
    expect(parseOptionalNumber('abc')).toBeNull()
    expect(Number.isNaN(parseOptionalNumber('abc') as number)).toBe(false)
  })
})

describe('datetimeLocalToWallClockIso', () => {
  it('preserves the time selected in a datetime-local input', () => {
    expect(datetimeLocalToWallClockIso('2026-10-15T09:00')).toBe('2026-10-15T09:00:00')
  })

  it('does not append duplicate seconds', () => {
    expect(datetimeLocalToWallClockIso('2026-10-15T09:00:30')).toBe('2026-10-15T09:00:30')
  })
})
