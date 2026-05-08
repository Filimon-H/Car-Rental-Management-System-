import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test the ApiClient class in isolation by re-importing a fresh instance.
// axios calls are mocked so no real HTTP is made.
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        put: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      })),
    },
  }
})

import apiClient from '@/services/apiClient'

describe('ApiClient — token management', () => {
  beforeEach(() => {
    localStorage.clear()
    apiClient.clearTokens()
  })

  it('isAuthenticated returns false when no token stored', () => {
    expect(apiClient.isAuthenticated()).toBe(false)
  })

  it('isAuthenticated returns true after setTokens', () => {
    apiClient.setTokens('access_abc', 'refresh_xyz')
    expect(apiClient.isAuthenticated()).toBe(true)
  })

  it('setTokens persists both tokens to localStorage', () => {
    apiClient.setTokens('access_abc', 'refresh_xyz')
    expect(localStorage.getItem('access_token')).toBe('access_abc')
    expect(localStorage.getItem('refresh_token')).toBe('refresh_xyz')
  })

  it('clearTokens removes tokens from localStorage', () => {
    apiClient.setTokens('access_abc', 'refresh_xyz')
    apiClient.clearTokens()
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  it('clearTokens makes isAuthenticated return false', () => {
    apiClient.setTokens('access_abc', 'refresh_xyz')
    apiClient.clearTokens()
    expect(apiClient.isAuthenticated()).toBe(false)
  })

  it('replaces existing tokens when setTokens called again', () => {
    apiClient.setTokens('first_access', 'first_refresh')
    apiClient.setTokens('second_access', 'second_refresh')
    expect(localStorage.getItem('access_token')).toBe('second_access')
    expect(localStorage.getItem('refresh_token')).toBe('second_refresh')
  })
})
