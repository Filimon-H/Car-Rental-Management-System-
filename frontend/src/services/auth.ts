import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from './apiClient'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: string
  permissions: string[]
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchUser: () => Promise<void>
  hasPermission: (permission: string) => boolean
  hasRole: (...roles: string[]) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await apiClient.post<{
            access_token: string
            refresh_token: string
          }>('/auth/login', { username, password })

          apiClient.setTokens(response.access_token, response.refresh_token)

          // Fetch user profile
          await get().fetchUser()
          set({ isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error  // Re-throw so LoginPage can catch it
        }
      },

      logout: async () => {
        try {
          await apiClient.post('/me/logout')
        } catch {
          // Ignore errors on logout
        } finally {
          apiClient.clearTokens()
          set({ user: null, isAuthenticated: false })
        }
      },

      fetchUser: async () => {
        try {
          const user = await apiClient.get<User>('/me')
          set({ user, isAuthenticated: true })
        } catch {
          apiClient.clearTokens()
          set({ user: null, isAuthenticated: false })
        }
      },

      hasPermission: (permission: string) => {
        const { user } = get()
        return user?.permissions.includes(permission) ?? false
      },

      hasRole: (...roles: string[]) => {
        const { user } = get()
        return user ? roles.includes(user.role) : false
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export const authService = {
  async login(username: string, password: string) {
    return useAuthStore.getState().login(username, password)
  },

  async logout() {
    return useAuthStore.getState().logout()
  },

  async fetchUser() {
    return useAuthStore.getState().fetchUser()
  },

  isAuthenticated() {
    return useAuthStore.getState().isAuthenticated
  },

  getUser() {
    return useAuthStore.getState().user
  },

  hasPermission(permission: string) {
    return useAuthStore.getState().hasPermission(permission)
  },

  hasRole(...roles: string[]) {
    return useAuthStore.getState().hasRole(...roles)
  },
}

export default authService
