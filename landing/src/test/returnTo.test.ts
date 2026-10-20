/**
 * Signing in or up returns the customer to the page they were heading for,
 * with the dates they had chosen, instead of the home page.
 */
import type { Location } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { returnTarget, returnToFrom } from '../lib/returnTo'

const at = (state: unknown) => ({ pathname: '/login', search: '', hash: '', key: 'k', state }) as Location

describe('returnTo', () => {
  it('keeps the booking page and the dates carried in its state', () => {
    const dates = { pickup: '2026-11-01T09:00', returnDate: '2026-11-08T09:00' }
    expect(returnTarget(at({ from: { pathname: '/book/3', state: dates } }))).toEqual([
      '/book/3',
      { replace: true, state: dates },
    ])
  })

  it('accepts a bare path, as My Bookings sends', () => {
    expect(returnToFrom(at({ from: '/my-bookings' }))).toEqual({ pathname: '/my-bookings' })
  })

  it('goes home when there is nowhere to return to', () => {
    expect(returnTarget(at(null))).toEqual(['/', { replace: true }])
  })

  it('never bounces back to the sign-in pages or off the site', () => {
    expect(returnToFrom(at({ from: { pathname: '/signup' } }))).toBeNull()
    expect(returnToFrom(at({ from: 'https://evil.example/' }))).toBeNull()
  })
})
