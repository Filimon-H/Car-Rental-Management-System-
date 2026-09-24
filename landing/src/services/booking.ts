import { apiClient } from './apiClient'

export interface PublicVehicle {
  id: number
  make: string
  model: string
  year: number
  vehicle_type: string
  seats: number
  transmission: string | null
  color: string
  daily_rate: string
  weekly_rate: string | null
  monthly_rate: string | null
  photo_front: string | null
  photo_back: string | null
  photo_left: string | null
  photo_right: string | null
  is_active: boolean
  status: 'available' | 'reserved' | 'rented'
  available_from: string | null
}

export interface BookingVehicle {
  id: number
  make: string
  model: string
  year: number
  plate_number: string
}

export interface MyBooking {
  id: number
  agreement_number: string
  status: string
  pickup_datetime: string
  expected_return_datetime: string
  agreed_daily_rate: string
  pickup_location: string | null
  return_location: string | null
  notes: string | null
  created_at: string
  vehicle: BookingVehicle | null
  total_charge: string | null
  total_paid: string | null
  balance_due: string | null
  deposit_amount: string
  advance_payment: string
  deposit_received: string
  deposit_held: string
  mileage_limit_per_day: number | null
  excess_mileage_rate: string | null
  fuel_level_out: number | null
  fuel_charge_rate: string | null
}

export interface PriceQuote {
  days: number
  total: string
  daily_rate: string
  weekly_rate: string | null
  monthly_rate: string | null
  pricing_note: string
}

export interface ExtensionQuote {
  days: number
  total: string
  daily_rate: string
}

export interface CreateBookingData {
  vehicle_id: number
  pickup_datetime: string
  expected_return_datetime: string
  pickup_location?: string
  return_location?: string
  notes?: string
}

export interface TelegramLinkCode {
  code: string
  expires_at: string
}

export interface TelegramLinkStatus {
  linked: boolean
  telegram_username: string | null
  linked_at: string | null
}

export const bookingService = {
  getVehicles: () => apiClient.get<PublicVehicle[]>('/vehicles'),
  getVehicle: (id: number) => apiClient.get<PublicVehicle>(`/vehicles/${id}`),
  getMyBookings: () => apiClient.get<MyBooking[]>('/bookings'),
  createBooking: (data: CreateBookingData) => apiClient.post<MyBooking>('/bookings', data),
  getQuote: (data: Pick<CreateBookingData, 'vehicle_id' | 'pickup_datetime' | 'expected_return_datetime'>) =>
    apiClient.post<PriceQuote>('/quotes', data),
  cancelBooking: (id: number) => apiClient.post(`/bookings/${id}/cancel`),
  generateTelegramLinkCode: () => apiClient.post<TelegramLinkCode>('/me/telegram/link-code'),
  getTelegramStatus: () => apiClient.get<TelegramLinkStatus>('/me/telegram'),
  extendBooking: (id: number, new_return_datetime: string) =>
    apiClient.post<MyBooking>(`/bookings/${id}/extend`, { new_return_datetime }),
  getExtensionQuote: (id: number, new_return_datetime: string) =>
    apiClient.post<ExtensionQuote>(`/bookings/${id}/extension-quote`, { new_return_datetime }),
}

export const STATUS_LABELS: Record<string, string> = {
  booking_requested: 'Pending Review',
  pending_payment: 'Confirmed – Payment Required Before Pickup',
  active: 'Active',
  returned: 'Returned',
  closed: 'Closed',
  cancelled: 'Cancelled',
  overdue: 'Overdue',
}

export const STATUS_COLORS: Record<string, string> = {
  booking_requested: 'text-yellow-400 bg-yellow-400/10',
  pending_payment: 'text-blue-400 bg-blue-400/10',
  active: 'text-green-400 bg-green-400/10',
  returned: 'text-gray-400 bg-gray-400/10',
  closed: 'text-gray-400 bg-gray-400/10',
  cancelled: 'text-red-400 bg-red-400/10',
  overdue: 'text-orange-400 bg-orange-400/10',
}
