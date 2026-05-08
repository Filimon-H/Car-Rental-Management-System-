import apiClient from './apiClient'

export interface LookupValue {
  id: number
  category: string
  value: string
  label: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LookupValueCreate {
  category: string
  value: string
  label?: string
  sort_order?: number
}

export interface LookupValueUpdate {
  value?: string
  label?: string
  sort_order?: number
  is_active?: boolean
}

export type LookupDefaultsResponse = Record<string, { value: string; label: string }[]>

export const lookupsService = {
  async listCategories(): Promise<string[]> {
    return apiClient.get('/lookups/categories')
  },

  async getDefaults(): Promise<LookupDefaultsResponse> {
    return apiClient.get('/lookups/defaults')
  },

  async listCategoryValues(category: string, includeInactive = true): Promise<LookupValue[]> {
    return apiClient.get(`/lookups/category/${category}`, { include_inactive: includeInactive })
  },

  async create(data: LookupValueCreate): Promise<LookupValue> {
    return apiClient.post('/lookups', data)
  },

  async update(id: number, data: LookupValueUpdate): Promise<LookupValue> {
    return apiClient.put(`/lookups/${id}`, data)
  },

  async remove(id: number): Promise<void> {
    return apiClient.delete(`/lookups/${id}`)
  },
}

export default lookupsService
