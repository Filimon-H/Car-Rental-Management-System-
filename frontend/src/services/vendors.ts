import apiClient from './apiClient'

export interface Vendor {
  id: number
  vendor_type: string  // individual, company
  company_name: string | null
  contact_person: string | null
  phone_primary: string
  phone_secondary: string | null
  email: string | null
  address: string | null
  city: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VendorListResponse {
  items: Vendor[]
  total: number
  page: number
  page_size: number
}

export interface VendorSearchResult {
  id: number
  company_name: string
  contact_person: string | null
  phone_primary: string
}

export interface CreateVendorData {
  vendor_type: string  // individual, company
  company_name?: string  // Required if vendor_type is company
  contact_person?: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  address?: string
  city?: string
  bank_name?: string
  bank_account_number?: string
  bank_account_holder?: string
  notes?: string
}

export const vendorsService = {
  async list(params?: {
    page?: number
    page_size?: number
    search?: string
    is_active?: boolean
  }): Promise<VendorListResponse> {
    return apiClient.get('/vendors', params)
  },

  async search(q: string, limit = 10): Promise<VendorSearchResult[]> {
    return apiClient.get('/vendors/search', { q, limit })
  },

  async getById(id: number): Promise<Vendor> {
    return apiClient.get(`/vendors/${id}`)
  },

  async create(data: CreateVendorData): Promise<Vendor> {
    return apiClient.post('/vendors', data)
  },

  async update(id: number, data: Partial<CreateVendorData>): Promise<Vendor> {
    return apiClient.put(`/vendors/${id}`, data)
  },

  async delete(id: number): Promise<void> {
    return apiClient.delete(`/vendors/${id}`)
  },
}

export default vendorsService
