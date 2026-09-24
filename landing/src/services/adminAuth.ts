import { create } from 'zustand'
import { API_BASE_URL } from './apiClient'

const STAFF_API_URL = API_BASE_URL

interface AdminAuthState {
  adminToken: string | null
  isAdminLoading: boolean
  adminLogin: (username: string, password: string) => Promise<void>
  adminLogout: () => void
}

const storedAdminToken = localStorage.getItem('admin_access_token')

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  adminToken: storedAdminToken || null,
  isAdminLoading: false,

  adminLogin: async (username: string, password: string) => {
    set({ isAdminLoading: true })
    try {
      const res = await fetch(`${STAFF_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Invalid admin credentials')
      }
      const data = await res.json()
      localStorage.setItem('admin_access_token', data.access_token)
      localStorage.setItem('admin_refresh_token', data.refresh_token)
      set({ adminToken: data.access_token })
    } finally {
      set({ isAdminLoading: false })
    }
  },

  adminLogout: () => {
    localStorage.removeItem('admin_access_token')
    localStorage.removeItem('admin_refresh_token')
    set({ adminToken: null })
  },
}))
