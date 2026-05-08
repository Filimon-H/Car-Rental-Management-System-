import apiClient from './apiClient'

export interface Driver {
  id: number
  first_name: string
  last_name: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  id_type?: string
  id_number?: string
  license_number: string
  license_expiry?: string
  license_class?: string
  house_number?: string
  wereda?: string
  subcity?: string
  city?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DriverListResponse {
  items: Driver[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface CreateDriverData {
  first_name: string
  last_name: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  id_type?: string
  id_number?: string
  license_number: string
  license_expiry?: string
  license_class?: string
  house_number?: string
  wereda?: string
  subcity?: string
  city?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  notes?: string
}

export interface DriverSearchParams {
  [key: string]: string | number | boolean | undefined
  page?: number
  page_size?: number
  search?: string
  is_active?: boolean
}

export const driversService = {
  async list(params: DriverSearchParams = {}): Promise<DriverListResponse> {
    return apiClient.get('/drivers', params)
  },

  async get(id: number): Promise<Driver> {
    return apiClient.get(`/drivers/${id}`)
  },

  async create(data: CreateDriverData): Promise<Driver> {
    return apiClient.post('/drivers', data)
  },

  async update(id: number, data: Partial<CreateDriverData>): Promise<Driver> {
    return apiClient.put(`/drivers/${id}`, data)
  },

  async delete(id: number): Promise<void> {
    return apiClient.delete(`/drivers/${id}`)
  },
}
