import apiClient from './apiClient'

export interface DamageRecord {
  area?: string
  severity?: string
  description?: string
  [key: string]: unknown
}

export interface Inspection {
  id: number
  template_id: number | null
  agreement_id: number | null
  vehicle_id: number
  inspection_type: string
  inspection_datetime: string
  inspector_id: number | null
  inspector_name: string | null
  customer_name: string | null
  mileage: number | null
  fuel_level: number | null
  checklist_results: Record<string, unknown>
  damage_records: DamageRecord[]
  condition_rating: number | null
  notes: string | null
  status: string
  created_at: string
  completed_at: string | null
}

export interface InspectionListResponse {
  items: Inspection[]
  total: number
  page: number
  page_size: number
}

export interface ChecklistItem {
  id: string
  label: string
  category: string
  required: boolean
}

export interface InspectionTemplate {
  id: number
  name: string
  description: string | null
  template_type: string
  checklist_items: ChecklistItem[]
  damage_categories: string[]
  is_active: boolean
  created_at: string
}

export interface TemplateInput {
  name: string
  description?: string | null
  template_type: string
  checklist_items: ChecklistItem[]
  damage_categories: string[]
  is_active?: boolean
}

export const templatesService = {
  async list(): Promise<InspectionTemplate[]> {
    return apiClient.get('/inspections/templates')
  },

  async create(data: TemplateInput): Promise<InspectionTemplate> {
    return apiClient.post('/inspections/templates', data)
  },

  async update(id: number, data: Partial<TemplateInput>): Promise<InspectionTemplate> {
    return apiClient.put(`/inspections/templates/${id}`, data)
  },

  /** Deactivates the template; past inspections keep their reference. */
  async retire(id: number): Promise<void> {
    return apiClient.delete(`/inspections/templates/${id}`)
  },
}

export const inspectionsService = {
  async list(params?: {
    vehicle_id?: number
    agreement_id?: number
    status?: string
    page?: number
    page_size?: number
  }): Promise<InspectionListResponse> {
    return apiClient.get('/inspections', params)
  },

  async getById(id: number): Promise<Inspection> {
    return apiClient.get(`/inspections/${id}`)
  },

  async update(id: number, data: Partial<Inspection>): Promise<Inspection> {
    return apiClient.put(`/inspections/${id}`, data)
  },

  /** Locks the inspection; a completed one can no longer be edited. */
  async complete(id: number): Promise<Inspection> {
    return apiClient.post(`/inspections/${id}/complete`)
  },

  async sign(id: number, customerName: string, customerSignature?: string): Promise<Inspection> {
    return apiClient.post(`/inspections/${id}/sign`, {
      customer_name: customerName,
      customer_signature: customerSignature,
    })
  },
}

export default inspectionsService
