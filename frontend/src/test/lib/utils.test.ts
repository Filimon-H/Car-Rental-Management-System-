import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

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
