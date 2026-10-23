/** The rate limiter's reply is explained, not shown as an axios message. */
import { describe, expect, it } from 'vitest'

import { getErrorMessage } from '@/services/apiClient'

describe('getErrorMessage', () => {
  it('explains a rate limit', () => {
    const error = { message: 'Request failed with status code 429', response: { status: 429, data: { error: 'Rate limit exceeded' } } }
    expect(getErrorMessage(error)).toBe('Too many attempts. Please wait a minute and try again.')
  })

  it('prefers the server detail', () => {
    expect(getErrorMessage({ response: { status: 409, data: { detail: 'Already exists' } } })).toBe('Already exists')
  })
})
