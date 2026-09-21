import apiClient from './apiClient'

export interface DashboardPickupStats {
  total: number
  today: number
  tomorrow: number
  within_5_days: number
  within_10_days: number
}

export interface DashboardInsuranceStats {
  total: number
  today: number
  within_5_days: number
  within_10_days: number
  within_month: number
  overdue: number
}

export interface DashboardVehicleStats {
  total: number
  available: number
  rented: number
  maintenance: number
  reserved: number
  insurance: DashboardInsuranceStats
}

export interface DashboardRevenue {
  collected_this_month: number
  outstanding_balance: number
  total_all_time: number
}

export interface VendorAgreementStats {
  total: number
  ending_today: number
  expiring_5_days: number
  expiring_10_days: number
  overdue: number
}

export interface DashboardRecentAgreement {
  id: number
  agreement_number: string
  customer_name: string
  status: string
  expected_return_datetime: string | null
  created_at: string
}

export interface CustomerAgreementStats {
  total: number
  ending_today: number
  expiring_5_days: number
  expiring_10_days: number
  overdue: number
}

export interface DashboardStats {
  active_agreements: number
  overdue_agreements: number
  pending_agreements: number
  booking_requests: number
  total_agreements: number
  due_today: number
  pickups: DashboardPickupStats
  vehicles: DashboardVehicleStats
  total_customers: number
  revenue: DashboardRevenue
  vendor_agreements: VendorAgreementStats
  customer_agreements: CustomerAgreementStats
  recent_agreements: DashboardRecentAgreement[]
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    return apiClient.get('/dashboard')
  },
}

export default dashboardService
