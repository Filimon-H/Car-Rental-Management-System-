import apiClient from './apiClient'

export interface CustomerSummary {
  id: number
  first_name: string
  last_name: string
  phone_primary: string
  business_type: string
}

export interface CollateralPerson {
  id: number
  customer_id: number
  first_name: string
  last_name: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  relationship_to_customer?: string
  id_type: string
  id_number: string
  house_number?: string
  wereda?: string
  subcity?: string
  city?: string
  occupation?: string
  employer_name?: string
  employer_phone?: string
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
  customer?: CustomerSummary
}

export interface CollateralListResponse {
  items: CollateralPerson[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface CreateCollateralData {
  customer_id: number
  first_name: string
  last_name: string
  phone_primary: string
  phone_secondary?: string
  email?: string
  relationship_to_customer?: string
  id_type: string
  id_number: string
  house_number?: string
  wereda?: string
  subcity?: string
  city?: string
  occupation?: string
  employer_name?: string
  employer_phone?: string
  notes?: string
}

export interface CollateralSearchParams {
  [key: string]: string | number | boolean | undefined
  page?: number
  page_size?: number
  search?: string
  customer_id?: number
  is_active?: boolean
}

export const collateralsService = {
  async list(params: CollateralSearchParams = {}): Promise<CollateralListResponse> {
    return apiClient.get('/collaterals', params)
  },

  async get(id: number): Promise<CollateralPerson> {
    return apiClient.get(`/collaterals/${id}`)
  },

  async create(data: CreateCollateralData): Promise<CollateralPerson> {
    return apiClient.post('/collaterals', data)
  },

  async update(id: number, data: Partial<CreateCollateralData>): Promise<CollateralPerson> {
    return apiClient.put(`/collaterals/${id}`, data)
  },

  async delete(id: number): Promise<void> {
    return apiClient.delete(`/collaterals/${id}`)
  },
}
