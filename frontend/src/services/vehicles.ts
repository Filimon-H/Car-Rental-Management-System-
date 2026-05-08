import apiClient from './apiClient'

export type VehicleStatus = 'available' | 'rented' | 'maintenance' | 'reserved' | 'retired'

export interface VendorSummary {
  id: number
  vendor_type: string
  company_name: string | null
  contact_person: string | null
  phone_primary: string
  email: string | null
}

export interface Vehicle {
  id: number
  vendor_id: number
  vendor: VendorSummary | null
  plate_number: string
  plate_code: string
  plate_city: string | null
  make: string
  model: string
  year: number
  color: string
  vehicle_type: string
  service_type: string
  car_condition: string
  motor_number: string | null
  chassis_number: string | null
  seats: number
  transmission: string
  fuel_type: string
  daily_rate: number
  status: VehicleStatus
  insurance_policy_number: string | null
  insurance_expiry: string | null
  photo_front?: string | null
  photo_back?: string | null
  photo_left?: string | null
  photo_right?: string | null
  current_mileage: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VehicleListResponse {
  items: Vehicle[]
  total: number
  page: number
  page_size: number
}

export interface VehicleSearchResult {
  id: number
  plate_number: string
  make: string
  model: string
  year: number
  color: string
  vehicle_type: string
  status: VehicleStatus
  daily_rate: number
}

export interface CreateVehicleData {
  vendor_id: number
  plate_number: string
  plate_code: string
  plate_city?: string
  make: string
  model: string
  year: number
  color: string
  vehicle_type: string
  service_type: string
  car_condition?: string
  motor_number?: string
  chassis_number?: string
  seats?: number
  transmission?: string
  fuel_type?: string
  daily_rate: number
  insurance_policy_number?: string
  insurance_expiry?: string
  current_mileage?: number
  notes?: string
}

export interface LookupValue {
  value: string
  label: string
}

export interface LookupDefaults {
  car_model: LookupValue[]
  color: LookupValue[]
  vehicle_type: LookupValue[]
  service_type: LookupValue[]
  plate_code: LookupValue[]
  fuel_type: LookupValue[]
  car_condition: LookupValue[]
}

export const vehiclesService = {
  async list(params?: {
    page?: number
    page_size?: number
    search?: string
    status?: VehicleStatus
    vehicle_type?: string
    is_active?: boolean
  }): Promise<VehicleListResponse> {
    return apiClient.get('/vehicles', params)
  },

  async search(q: string, limit = 10, availableOnly = false): Promise<VehicleSearchResult[]> {
    return apiClient.get('/vehicles/search', { q, limit, available_only: availableOnly })
  },

  async getById(id: number): Promise<Vehicle> {
    return apiClient.get(`/vehicles/${id}`)
  },

  async create(data: CreateVehicleData): Promise<Vehicle> {
    return apiClient.post('/vehicles', data)
  },

  async update(id: number, data: Partial<CreateVehicleData>): Promise<Vehicle> {
    return apiClient.put(`/vehicles/${id}`, data)
  },

  async updateStatus(id: number, status: VehicleStatus, notes?: string): Promise<Vehicle> {
    return apiClient.patch(`/vehicles/${id}/status`, { status, notes })
  },

  async delete(id: number): Promise<void> {
    return apiClient.delete(`/vehicles/${id}`)
  },

  async uploadPhotos(
    vehicleId: number,
    files: {
      front?: File | null
      back?: File | null
      left?: File | null
      right?: File | null
    }
  ): Promise<Vehicle> {
    const formData = new FormData()
    if (files.front) formData.append('front', files.front)
    if (files.back) formData.append('back', files.back)
    if (files.left) formData.append('left', files.left)
    if (files.right) formData.append('right', files.right)
    return apiClient.postFormData(`/vehicles/${vehicleId}/photos`, formData)
  },

  async getLookupDefaults(): Promise<LookupDefaults> {
    return apiClient.get('/lookups/defaults')
  },
}

export default vehiclesService
