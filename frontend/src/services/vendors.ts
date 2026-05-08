import apiClient from './apiClient'

export interface Vendor {
  id: number
  vendor_type: string
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
  commission_rate: number
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VendorPayment {
  id: number
  vendor_id: number
  agreement_id: number | null
  amount: number
  payment_method: string
  payment_reference: string | null
  notes: string | null
  created_by_id: number | null
  created_at: string
}

export interface VendorPayableSummary {
  vendor_id: number
  vendor_name: string
  commission_rate: number
  reserved_amount: number
  earned_amount: number
  paid_amount: number
  outstanding_payable: number
  agreement_count: number
  agreements: {
    agreement_id: number
    agreement_number: string
    agreement_status: string
    payable_amount: number
    segment_count: number
  }[]
}

export interface RecordVendorPaymentData {
  amount: number
  payment_method: string
  payment_reference?: string
  notes?: string
  agreement_id?: number
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
  vendor_type: string
  company_name?: string
  contact_person?: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  address?: string
  city?: string
  bank_name?: string
  bank_account_number?: string
  bank_account_holder?: string
  commission_rate?: number
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

  async getSummary(id: number): Promise<VendorPayableSummary> {
    return apiClient.get(`/vendors/${id}/summary`)
  },

  async getPayments(id: number): Promise<VendorPayment[]> {
    return apiClient.get(`/vendors/${id}/payments`)
  },

  async postPayment(id: number, data: RecordVendorPaymentData): Promise<VendorPayment> {
    return apiClient.post(`/vendors/${id}/payments`, data)
  },
}

export default vendorsService
