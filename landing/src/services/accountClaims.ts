import { apiClient } from './apiClient'

export interface ClaimStatus {
  status: 'pending' | 'linked' | 'expired'
  access_token: string | null
}

export interface InviteDetails {
  first_name: string
  email: string | null
  expires_at: string
}

/** Linking a website login to a customer first entered at the counter. */
export const accountClaims = {
  status: (token: string) => apiClient.get<ClaimStatus>(`/auth/claims/${encodeURIComponent(token)}`),
  invite: (token: string) => apiClient.get<InviteDetails>(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, email: string, password: string) =>
    apiClient.post<{ access_token: string }>(`/auth/invites/${encodeURIComponent(token)}`, { email, password }),
}
