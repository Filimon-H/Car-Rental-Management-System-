import apiClient from './apiClient'

export interface DashboardVehicleStats {
  total: number
  available: number
  rented: number
  maintenance: number
}

export interface DashboardRevenue {
  collected_this_month: number
  outstanding_balance: number
  total_all_time: number
}

export interface DashboardRecentAgreement {
  id: number
  agreement_number: string
  customer_name: string
  status: string
  expected_return_datetime: string | null
  created_at: string
}

export interface DashboardStats {
  active_agreements: number
  overdue_agreements: number
  pending_agreements: number
  total_agreements: number
  due_today: number
  vehicles: DashboardVehicleStats
  total_customers: number
  revenue: DashboardRevenue
  recent_agreements: DashboardRecentAgreement[]
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    return apiClient.get('/dashboard')
  },
}

export default dashboardService
