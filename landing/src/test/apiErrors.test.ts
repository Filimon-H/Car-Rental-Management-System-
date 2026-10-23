/** Server errors reach the customer as something they can act on. */
import { describe, expect, it } from 'vitest'

import { describeApiError } from '../services/apiClient'

describe('describeApiError', () => {
  it('explains a rate limit instead of showing "HTTP 429"', () => {
    // slowapi answers {"error": "..."}, with no detail.
    expect(describeApiError({ error: 'Rate limit exceeded: 3 per 1 minute' }, 429)).toBe(
      'Too many attempts. Please wait a minute and try again.'
    )
  })

  it('does not blame the customer for a server failure', () => {
    expect(describeApiError({ detail: 'Internal server error' }, 500)).toBe('Internal server error')
    expect(describeApiError(null, 502)).toBe('Something went wrong on our side. Please try again in a moment.')
  })

  it('still shows the server message when there is one', () => {
    expect(describeApiError({ detail: 'Email already registered' }, 409)).toBe('Email already registered')
  })
})
