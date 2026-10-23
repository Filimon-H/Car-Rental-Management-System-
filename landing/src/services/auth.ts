import { create } from 'zustand'
import { apiClient, isTokenExpired } from './apiClient'

export interface CustomerProfile {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone_primary: string
  phone_secondary: string | null
  id_type: string | null
  id_number: string | null
  id_expiry: string | null
  license_number: string | null
  license_expiry: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
}

interface SignupData {
  email: string
  password: string
  first_name: string
  last_name: string
  phone: string
}

/**
 * A signup either signs in, or — when the phone belongs to a customer we
 * already have from the counter — has to be confirmed on Telegram first.
 */
export interface AccountClaim {
  status: 'confirm_identity'
  claim_token: string
  telegram_url: string | null
  expires_at: string
}

export type SignupResult = { kind: 'signed_in' } | { kind: 'confirm_identity'; claim: AccountClaim }

interface AuthState {
  token: string | null
  profile: CustomerProfile | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<SignupResult>
  /** Sign in with a token the server issued another way (claim, invite). */
  signInWithToken: (token: string) => Promise<void>
  logout: () => void
  clearAuth: () => void
  fetchProfile: () => Promise<void>
}

// Clear expired token before the store initialises so it never starts stale
const storedToken = localStorage.getItem('customer_token')
if (isTokenExpired(storedToken)) {
  localStorage.removeItem('customer_token')
}

export const useAuthStore = create<AuthState>((set, get) => {
  const store: AuthState = {
    token: isTokenExpired(storedToken) ? null : storedToken,
    profile: null,
    isLoading: false,

    login: async (email, password) => {
      const data = await apiClient.post<{ access_token: string }>('/auth/login', { email, password })
      localStorage.setItem('customer_token', data.access_token)
      set({ token: data.access_token })
      await get().fetchProfile()
    },

    signup: async (signupData) => {
      const data = await apiClient.post<{ access_token: string } | AccountClaim>('/auth/signup', signupData)
      if ('claim_token' in data) return { kind: 'confirm_identity', claim: data }
      await get().signInWithToken(data.access_token)
      return { kind: 'signed_in' }
    },

    signInWithToken: async (token) => {
      localStorage.setItem('customer_token', token)
      set({ token })
      await get().fetchProfile()
    },

    logout: () => {
      apiClient.post('/auth/logout').catch(() => {})
      get().clearAuth()
    },

    clearAuth: () => {
      localStorage.removeItem('customer_token')
      set({ token: null, profile: null })
    },

    fetchProfile: async () => {
      const { token } = get()
      if (!token || isTokenExpired(token)) {
        get().clearAuth()
        return
      }
      try {
        set({ isLoading: true })
        const profile = await apiClient.get<CustomerProfile>('/me')
        set({ profile })
      } catch {
        // 401 is already handled by apiClient (clearAuthAndRedirect)
      } finally {
        set({ isLoading: false })
      }
    },
  }

  // React to 401s fired by apiClient from anywhere in the app
  window.addEventListener('auth:expired', () => {
    store.clearAuth()
  })

  return store
})
