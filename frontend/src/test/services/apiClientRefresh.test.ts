import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')

/**
 * A page that fires several queries at once gets several 401s at once. Each used
 * to start its own refresh call, spending a refresh token that a sibling had
 * already rotated away.
 */
describe('apiClient concurrent token refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('access_token', 'stale-access')
    localStorage.setItem('refresh_token', 'the-refresh-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('issues a single refresh for simultaneous 401s', async () => {
    const post = vi.fn().mockResolvedValue({ data: { access_token: 'fresh-access' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).post = post
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).create = vi.fn(() => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      post: vi.fn(),
      get: vi.fn(),
    }))

    const { apiClient } = await import('@/services/apiClient')

    // Three callers hit the refresh path at the same moment.
    const results = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (apiClient as any).refreshAccessToken('the-refresh-token'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (apiClient as any).refreshAccessToken('the-refresh-token'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (apiClient as any).refreshAccessToken('the-refresh-token'),
    ])

    expect(post).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['fresh-access', 'fresh-access', 'fresh-access'])
    expect(localStorage.getItem('access_token')).toBe('fresh-access')
  })

  it('allows a new refresh after the previous one settles', async () => {
    const post = vi.fn().mockResolvedValue({ data: { access_token: 'fresh-access' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).post = post
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).create = vi.fn(() => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      post: vi.fn(),
      get: vi.fn(),
    }))

    const { apiClient } = await import('@/services/apiClient')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (apiClient as any).refreshAccessToken('the-refresh-token')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (apiClient as any).refreshAccessToken('the-refresh-token')

    // The in-flight promise is cleared on settle, so the second is a real call.
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight refresh when it fails, so a retry can start', async () => {
    const post = vi.fn().mockRejectedValue(new Error('refresh rejected'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).post = post
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(axios as any).create = vi.fn(() => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      post: vi.fn(),
      get: vi.fn(),
    }))

    const { apiClient } = await import('@/services/apiClient')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((apiClient as any).refreshAccessToken('t')).rejects.toThrow()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((apiClient as any).refreshAccessToken('t')).rejects.toThrow()

    expect(post).toHaveBeenCalledTimes(2)
  })
})
