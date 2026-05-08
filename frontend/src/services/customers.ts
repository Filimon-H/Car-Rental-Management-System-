import apiClient from './apiClient'

export interface Customer {
  id: number
  business_type: string
  company_name: string | null
  tin_number: string | null
  first_name: string
  last_name: string
  full_name: string
  phone_primary: string
  phone_secondary: string | null
  email: string | null
  id_type: string
  id_number: string
  id_expiry_date: string | null
  driver_license_number: string
  driver_license_expiry: string | null
  house_number: string | null
  wereda: string | null
  subcity: string | null
  city: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CustomerListResponse {
  items: Customer[]
  total: number
  page: number
  page_size: number
}

export interface CustomerSearchResult {
  id: number
  full_name: string
  phone_primary: string
  id_number: string
}

export interface CreateCustomerData {
  business_type: string  // individual, company, government, embassy, ngo, church
  company_name?: string  // Required if not individual
  tin_number?: string
  first_name: string
  last_name: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  id_type?: string  // Only for individual
  id_number?: string  // Only for individual
  id_expiry_date?: string
  driver_license_number?: string  // Only for individual
  driver_license_expiry?: string
  house_number?: string
  wereda?: string
  subcity?: string
  city?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  notes?: string
}

export interface DuplicateCheckResult {
  duplicate: boolean
  customer_id: number | null
  customer_name?: string
  match: 'id_number' | 'license_number' | 'phone' | null
}

export const customersService = {
  async list(params?: {
    page?: number
    page_size?: number
    search?: string
    is_active?: boolean
  }): Promise<CustomerListResponse> {
    return apiClient.get('/customers', params)
  },

  async search(q: string, limit = 10): Promise<CustomerSearchResult[]> {
    return apiClient.get('/customers/search', { q, limit })
  },

  async checkDuplicate(params: {
    id_number?: string
    license_number?: string
    phone?: string
    exclude_id?: number
  }): Promise<DuplicateCheckResult> {
    return apiClient.get('/customers/check-duplicate', params)
  },

  async getById(id: number): Promise<Customer> {
    return apiClient.get(`/customers/${id}`)
  },

  async create(data: CreateCustomerData): Promise<Customer> {
    return apiClient.post('/customers', data)
  },

  async update(id: number, data: Partial<CreateCustomerData>): Promise<Customer> {
    return apiClient.put(`/customers/${id}`, data)
  },

  async delete(id: number): Promise<void> {
    return apiClient.delete(`/customers/${id}`)
  },

  async bulkUpload(file: File): Promise<BulkUploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.postFormData('/customers/bulk-upload', formData)
  },

  async downloadBulkTemplate(): Promise<void> {
    const blob = await apiClient.getBlob('/customers/bulk-upload/template')
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_upload_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  },
}

export interface BulkUploadResult {
  total_rows: number
  successful: number
  failed: number
  errors: Array<{
    row: number
    field: string | null
    message: string
  }>
  created_ids: number[]
}

export default customersService
