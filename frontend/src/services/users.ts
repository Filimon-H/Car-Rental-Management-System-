import apiClient from './apiClient'

export type UserRole = 'admin' | 'sales' | 'fleet' | 'inspector' | 'accountant'

export interface StaffUser {
  id: number
  username: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface StaffUserListResponse {
  items: StaffUser[]
  total: number
  page: number
  page_size: number
}

export interface CreateUserData {
  username: string
  email: string
  password: string
  full_name: string
  role: UserRole
}

export interface UpdateUserData {
  full_name?: string
  email?: string
  role?: UserRole
  is_active?: boolean
}

export interface ResetPasswordData {
  new_password: string
}

export const usersService = {
  list: (params?: { page?: number; page_size?: number; search?: string; is_active?: boolean }) =>
    apiClient.get<StaffUserListResponse>('/users', { params }),

  get: (id: number) => apiClient.get<StaffUser>(`/users/${id}`),

  create: (data: CreateUserData) => apiClient.post<StaffUser>('/users', data),

  update: (id: number, data: UpdateUserData) => apiClient.put<StaffUser>(`/users/${id}`, data),

  resetPassword: (id: number, data: ResetPasswordData) =>
    apiClient.post<void>(`/users/${id}/reset-password`, data),
}
