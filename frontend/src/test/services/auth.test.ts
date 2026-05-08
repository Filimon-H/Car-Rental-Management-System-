import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock apiClient before importing the store
const mockApiClient = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  isAuthenticated: vi.fn(() => false),
}))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { useAuthStore } from '@/services/auth'

const adminUser = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  full_name: 'Admin User',
  role: 'admin',
  permissions: ['manage_users', 'view_customers', 'manage_customers', 'view_vehicles'],
}

const salesUser = {
  id: 2,
  username: 'sales',
  email: 'sales@example.com',
  full_name: 'Sales User',
  role: 'sales',
  permissions: ['view_customers', 'manage_customers', 'view_agreements', 'create_agreements'],
}

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('user is null', () => {
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('isAuthenticated is false', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('isLoading is false', () => {
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------

  describe('login', () => {
    it('calls POST /auth/login with credentials', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        access_token: 'at',
        refresh_token: 'rt',
      })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass123')

      expect(mockApiClient.post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: 'pass123',
      })
    })

    it('calls setTokens with returned tokens', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        access_token: 'access_abc',
        refresh_token: 'refresh_xyz',
      })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass')

      expect(mockApiClient.setTokens).toHaveBeenCalledWith('access_abc', 'refresh_xyz')
    })

    it('fetches user profile after token set', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        access_token: 'at',
        refresh_token: 'rt',
      })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass')

      expect(mockApiClient.get).toHaveBeenCalledWith('/me')
    })

    it('sets isAuthenticated to true after successful login', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        access_token: 'at',
        refresh_token: 'rt',
      })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass')

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('stores user object in state', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        access_token: 'at',
        refresh_token: 'rt',
      })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass')

      expect(useAuthStore.getState().user).toEqual(adminUser)
    })

    it('resets isLoading to false after success', async () => {
      mockApiClient.post.mockResolvedValueOnce({ access_token: 'at', refresh_token: 'rt' })
      mockApiClient.get.mockResolvedValueOnce(adminUser)

      await useAuthStore.getState().login('admin', 'pass')

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('resets isLoading to false after failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Invalid credentials'))

      await expect(useAuthStore.getState().login('admin', 'wrong')).rejects.toThrow()

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('rethrows error on failed login', async () => {
      const error = new Error('401 Unauthorized')
      mockApiClient.post.mockRejectedValueOnce(error)

      await expect(useAuthStore.getState().login('admin', 'wrong')).rejects.toThrow(
        '401 Unauthorized'
      )
    })

    it('does not set user on failed login', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('bad credentials'))

      try { await useAuthStore.getState().login('x', 'y') } catch { /* expected */ }

      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------

  describe('logout', () => {
    beforeEach(async () => {
      // Log in first
      mockApiClient.post.mockResolvedValueOnce({ access_token: 'at', refresh_token: 'rt' })
      mockApiClient.get.mockResolvedValueOnce(adminUser)
      await useAuthStore.getState().login('admin', 'pass')
      vi.clearAllMocks()
    })

    it('calls POST /me/logout', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await useAuthStore.getState().logout()
      expect(mockApiClient.post).toHaveBeenCalledWith('/me/logout')
    })

    it('clears tokens', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await useAuthStore.getState().logout()
      expect(mockApiClient.clearTokens).toHaveBeenCalled()
    })

    it('sets user to null', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await useAuthStore.getState().logout()
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('sets isAuthenticated to false', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await useAuthStore.getState().logout()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('still clears tokens even if POST /me/logout fails', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('network error'))
      await useAuthStore.getState().logout()  // should not throw
      expect(mockApiClient.clearTokens).toHaveBeenCalled()
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // fetchUser
  // ---------------------------------------------------------------------------

  describe('fetchUser', () => {
    it('sets user and isAuthenticated on success', async () => {
      mockApiClient.get.mockResolvedValueOnce(salesUser)
      await useAuthStore.getState().fetchUser()
      expect(useAuthStore.getState().user).toEqual(salesUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('clears state on failure', async () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true })
      mockApiClient.get.mockRejectedValueOnce(new Error('401'))
      await useAuthStore.getState().fetchUser()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('calls clearTokens on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('401'))
      await useAuthStore.getState().fetchUser()
      expect(mockApiClient.clearTokens).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // hasPermission
  // ---------------------------------------------------------------------------

  describe('hasPermission', () => {
    it('returns true when user has the permission', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasPermission('manage_users')).toBe(true)
    })

    it('returns false when user lacks the permission', () => {
      useAuthStore.setState({ user: salesUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasPermission('manage_users')).toBe(false)
    })

    it('returns false when user is null', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false })
      expect(useAuthStore.getState().hasPermission('view_customers')).toBe(false)
    })

    it('is case-sensitive', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasPermission('MANAGE_USERS')).toBe(false)
    })

    it('returns false for unknown permission', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasPermission('nonexistent_permission')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // hasRole
  // ---------------------------------------------------------------------------

  describe('hasRole', () => {
    it('returns true when user role matches single arg', () => {
      useAuthStore.setState({ user: adminUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasRole('admin')).toBe(true)
    })

    it('returns false when role does not match', () => {
      useAuthStore.setState({ user: salesUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasRole('admin')).toBe(false)
    })

    it('returns true when user role matches any of multiple args', () => {
      useAuthStore.setState({ user: salesUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasRole('admin', 'sales', 'fleet')).toBe(true)
    })

    it('returns false when user role matches none of multiple args', () => {
      useAuthStore.setState({ user: salesUser, isAuthenticated: true })
      expect(useAuthStore.getState().hasRole('admin', 'fleet', 'inspector')).toBe(false)
    })

    it('returns false when user is null', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false })
      expect(useAuthStore.getState().hasRole('admin')).toBe(false)
    })
  })
})
