import { create } from 'zustand'
import { API_BASE_URL } from './apiClient'

const STAFF_API_URL = API_BASE_URL

interface AdminAuthState {
  isAdminLoading: boolean
  /** Authenticates staff and returns the tokens; nothing is persisted here. */
  adminLogin: (username: string, password: string) => Promise<AdminTokens>
}

export interface AdminTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Staff tokens are never stored on the public origin.
 *
 * This used to write admin_access_token and admin_refresh_token into the
 * landing site's localStorage, where they sat indefinitely. The landing page
 * renders customer-supplied notes and vehicle data, so any XSS here would
 * have handed over a staff session — and a refresh token outlives the access
 * token it sits beside, so expiry was no protection. The tokens exist only to
 * hand off to the admin app, which owns them, so they are returned to the
 * caller and never persisted.
 */
export const useAdminAuthStore = create<AdminAuthState>((set) => ({
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
      return { accessToken: data.access_token, refreshToken: data.refresh_token }
    } finally {
      set({ isAdminLoading: false })
    }
  },
}))

/**
 * Removes staff tokens an older build left behind.
 *
 * Without this, anyone who used the staff login before this change keeps a
 * refresh token on the public origin forever.
 */
export function purgeLegacyAdminTokens(): void {
  try {
    localStorage.removeItem('admin_access_token')
    localStorage.removeItem('admin_refresh_token')
  } catch {
    // Private mode or blocked storage: nothing to purge.
  }
}
