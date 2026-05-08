import apiClient from './apiClient'

export interface VehicleSegment {
  id: number
  vehicle_id: number
  plate_number: string
  make: string
  model: string
  start_datetime: string
  end_datetime: string
  daily_rate: number
}

export type AgreementType = 'customer_vehicle' | 'customer_vehicle_driver' | 'vendor_vehicle' | 'standard' | 'wedding' | 'vendor_wedding'

export interface DriverSummary {
  id: number
  first_name: string
  last_name: string
  phone_primary: string
  license_number: string
}

export interface CollateralSummary {
  id: number
  first_name: string
  last_name: string
  phone_primary: string
  id_type: string
  id_number: string
  relationship_to_customer?: string
}

export interface Agreement {
  id: number
  agreement_number: string
  agreement_type: AgreementType
  status: 'draft' | 'pending_payment' | 'active' | 'returned' | 'closed' | 'overdue' | 'cancelled'
  customer_id: number
  customer_name: string
  driver_id?: number
  driver?: DriverSummary
  collateral_person_id?: number
  collateral_person?: CollateralSummary
  pickup_datetime: string
  expected_return_datetime: string
  actual_return_datetime: string | null
  agreed_daily_rate: number
  deposit_amount: number
  advance_payment?: number
  pickup_location: string | null
  return_location: string | null
  notes: string | null
  created_at: string
  closed_at: string | null
}

export interface AgreementDetail extends Agreement {
  vehicle_segments: VehicleSegment[]
  balance: number
  total_charges: number
  total_payments: number

  deposit_received?: number
  deposit_applied?: number
  deposit_returned?: number
  deposit_held?: number
  balance_due?: number
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'telebirr' | 'cbe_birr' | 'check' | 'other'

export interface PostDepositData {
  amount: number
  payment_method: PaymentMethod
  notes?: string
}

export interface ApplyDepositData {
  amount: number
  notes?: string
}

export interface RefundDepositData {
  amount: number
  notes?: string
}

export interface PostChargeData {
  amount: number
  description?: string
  notes?: string
}

export interface AgreementListResponse {
  items: Agreement[]
  total: number
  page: number
  page_size: number
}

export interface LedgerEntry {
  id: number
  entry_type: string
  amount: number
  description: string
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
}

export interface CreateAgreementData {
  agreement_type?: AgreementType
  customer_id: number
  vehicle_id: number
  driver_id?: number
  collateral_person_id?: number
  pickup_datetime: string
  expected_return_datetime: string
  daily_rate: number
  deposit_amount?: number
  advance_payment?: number
  pickup_location?: string
  return_location?: string
  notes?: string
}

export interface PostPaymentData {
  amount: number
  payment_method: PaymentMethod
  description?: string
  payment_reference?: string
  notes?: string
}

export const agreementsService = {
  async list(params?: {
    status?: string
    customer_id?: number
    page?: number
    page_size?: number
  }): Promise<AgreementListResponse> {
    return apiClient.get('/agreements', params)
  },

  async getById(id: number): Promise<AgreementDetail> {
    return apiClient.get(`/agreements/${id}`)
  },

  async create(data: CreateAgreementData): Promise<Agreement> {
    return apiClient.post('/agreements', data)
  },

  async extend(id: number, newReturnDatetime: string): Promise<Agreement> {
    return apiClient.post(`/agreements/${id}/extend`, {
      new_return_datetime: newReturnDatetime,
    })
  },

  async close(
    id: number,
    data: {
      actual_return_datetime: string
      return_mileage?: number
      notes?: string
    }
  ): Promise<Agreement> {
    return apiClient.post(`/agreements/${id}/close`, data)
  },

  async getLedger(id: number): Promise<LedgerEntry[]> {
    return apiClient.get(`/agreements/${id}/ledger`)
  },

  async postPayment(id: number, data: PostPaymentData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/payments`, data)
  },

  async receiveDeposit(id: number, data: PostDepositData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/deposits`, data)
  },

  async applyDeposit(id: number, data: ApplyDepositData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/deposits/apply`, data)
  },

  async refundDeposit(id: number, data: RefundDepositData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/deposits/refund`, data)
  },

  async postDamageCharge(id: number, data: PostChargeData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/charges/damage`, data)
  },

  async postLateFee(id: number, data: PostChargeData): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/charges/late`, data)
  },

  async postAdjustment(
    id: number,
    data: { amount: number; description: string; notes?: string }
  ): Promise<LedgerEntry> {
    return apiClient.post(`/agreements/${id}/adjustments`, data)
  },

  async activate(id: number): Promise<Agreement> {
    return apiClient.post(`/agreements/${id}/activate`)
  },

  async markReturned(
    id: number,
    data: { actual_return_datetime: string; return_mileage?: number; notes?: string }
  ): Promise<Agreement> {
    return apiClient.post(`/agreements/${id}/return`, data)
  },
}

export interface AvailableVehicle {
  id: number
  vendor_id: number
  vendor_name: string
  plate_number: string
  plate_code: string
  make: string
  model: string
  year: number
  color: string
  vehicle_type: string
  service_type: string
  fuel_type: string
  insurance_expiry: string | null
  seats: number
  transmission: string
  daily_rate: number
}

export const availabilityService = {
  async getAvailableVehicles(
    startDatetime: string,
    endDatetime: string,
    vehicleType?: string
  ): Promise<AvailableVehicle[]> {
    return apiClient.get('/availability/vehicles', {
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      vehicle_type: vehicleType,
    })
  },

  async checkVehicle(
    vehicleId: number,
    startDatetime: string,
    endDatetime: string,
    excludeAgreementId?: number
  ): Promise<{ vehicle_id: number; available: boolean; message: string | null }> {
    return apiClient.get(`/availability/check/${vehicleId}`, {
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      exclude_agreement_id: excludeAgreementId,
    })
  },
}

export default agreementsService
