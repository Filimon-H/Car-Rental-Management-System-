import apiClient from './apiClient'

/**
 * Vehicle service history.
 *
 * The backend has recorded and reported maintenance for some time — history
 * per vehicle, and which vehicles are due by date or mileage — but nothing in
 * the admin app called it, so staff had no way to log a service or see one
 * coming.
 *
 * performed_at and next_due_date are true instants (UtcDateTime), unlike
 * pickup and return, which are local wall-clock. Send them as real ISO
 * timestamps.
 */

export type MaintenanceType =
  | 'routine_service'
  | 'oil_change'
  | 'tire_replacement'
  | 'brake_service'
  | 'repair'
  | 'bodywork'
  | 'inspection'
  | 'other'

export const MAINTENANCE_TYPES: MaintenanceType[] = [
  'routine_service',
  'oil_change',
  'tire_replacement',
  'brake_service',
  'repair',
  'bodywork',
  'inspection',
  'other',
]

export interface MaintenanceRecord {
  id: number
  vehicle_id: number
  service_type: MaintenanceType
  performed_at: string
  description: string
  odometer: number | null
  cost: string
  provider: string | null
  notes: string | null
  next_due_date: string | null
  next_due_mileage: number | null
  created_at: string
}

export interface MaintenanceCreate {
  service_type: MaintenanceType
  performed_at: string
  description: string
  odometer?: number | null
  cost?: number
  provider?: string | null
  notes?: string | null
  next_due_date?: string | null
  next_due_mileage?: number | null
}

export interface MaintenanceDueItem {
  vehicle_id: number
  plate_number: string
  vehicle: string
  last_service_type: string
  last_service_at: string
  next_due_date: string | null
  next_due_mileage: number | null
  current_mileage: number | null
  due_reason: string
}

/** A date input value (YYYY-MM-DD) as the instant of local midnight. */
export function dateInputToInstant(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString()
}

export const maintenanceService = {
  listForVehicle: (vehicleId: number) =>
    apiClient.get<MaintenanceRecord[]>(`/maintenance/vehicles/${vehicleId}`),
  create: (vehicleId: number, data: MaintenanceCreate) =>
    apiClient.post<MaintenanceRecord>(`/maintenance/vehicles/${vehicleId}`, data),
  remove: (recordId: number) => apiClient.delete<void>(`/maintenance/${recordId}`),
  due: () => apiClient.get<MaintenanceDueItem[]>('/maintenance/due'),
}
