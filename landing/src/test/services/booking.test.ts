/**
 * Tests for the public bookingService (landing app).
 *
 * Covers:
 * - extendBooking: calls correct endpoint, returns updated booking with financials
 * - generateTelegramLinkCode: calls /me/telegram/link-code, returns code + expiry
 * - getTelegramStatus: linked / not-linked states
 * - createBooking: correct payload, returns booking_requested status
 * - cancelBooking: calls correct endpoint
 * - getMyBookings: returns bookings with financial summary fields
 * - getVehicles / getVehicle: correct URLs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the apiClient before importing the service
const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/services/apiClient', () => ({ apiClient: mockApiClient }))

import { bookingService } from '@/services/booking'

// ─── Sample fixtures ──────────────────────────────────────────────────────────

const sampleVehicle = {
  id: 3,
  make: 'Toyota',
  model: 'Corolla',
  year: 2023,
  vehicle_type: 'Sedan',
  seats: 5,
  transmission: 'Automatic',
  color: 'White',
  daily_rate: '1500.00',
  photo_front: null,
  photo_back: null,
  photo_left: null,
  photo_right: null,
  is_active: true,
  status: 'available' as const,
  available_from: null,
}

const sampleBooking = {
  id: 7,
  agreement_number: 'AGR-20260501-0007',
  status: 'booking_requested',
  pickup_datetime: '2026-05-15T08:00:00Z',
  expected_return_datetime: '2026-05-18T08:00:00Z',
  agreed_daily_rate: '1500.00',
  pickup_location: null,
  return_location: null,
  notes: null,
  created_at: '2026-05-11T00:00:00Z',
  vehicle: { id: 3, make: 'Toyota', model: 'Corolla', year: 2023, plate_number: 'AA-12345' },
  total_charge: null,
  total_paid: null,
  balance_due: null,
}

const activeBooking = {
  ...sampleBooking,
  status: 'active',
  total_charge: '4500.00',
  total_paid: '0.00',
  balance_due: '4500.00',
}

// ─── extendBooking ────────────────────────────────────────────────────────────

describe('bookingService.extendBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /bookings/:id/extend with new_return_datetime', async () => {
    const extended = { ...activeBooking, expected_return_datetime: '2026-05-21T08:00:00Z' }
    mockApiClient.post.mockResolvedValueOnce(extended)
    await bookingService.extendBooking(7, '2026-05-21T08:00:00Z')
    expect(mockApiClient.post).toHaveBeenCalledWith('/bookings/7/extend', {
      new_return_datetime: '2026-05-21T08:00:00Z',
    })
  })

  it('returns the booking with the updated expected_return_datetime', async () => {
    const extended = { ...activeBooking, expected_return_datetime: '2026-05-21T08:00:00Z' }
    mockApiClient.post.mockResolvedValueOnce(extended)
    const result = await bookingService.extendBooking(7, '2026-05-21T08:00:00Z')
    expect(result.expected_return_datetime).toBe('2026-05-21T08:00:00Z')
  })

  it('returned booking includes financial summary fields', async () => {
    const extended = {
      ...activeBooking,
      total_charge: '9000.00',
      total_paid: '0.00',
      balance_due: '9000.00',
    }
    mockApiClient.post.mockResolvedValueOnce(extended)
    const result = await bookingService.extendBooking(7, '2026-05-21T08:00:00Z')
    expect(result.total_charge).toBe('9000.00')
    expect(result.balance_due).toBe('9000.00')
  })

  it('uses the booking id in the URL path', async () => {
    mockApiClient.post.mockResolvedValueOnce(activeBooking)
    await bookingService.extendBooking(42, '2026-06-01T08:00:00Z')
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/bookings/42/extend',
      expect.any(Object)
    )
  })
})

// ─── generateTelegramLinkCode ─────────────────────────────────────────────────

describe('bookingService.generateTelegramLinkCode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /me/telegram/link-code', async () => {
    mockApiClient.post.mockResolvedValueOnce({ code: 'ABCD1234', expires_at: '2026-05-11T13:00:00Z' })
    await bookingService.generateTelegramLinkCode()
    expect(mockApiClient.post).toHaveBeenCalledWith('/me/telegram/link-code')
  })

  it('returns the link code and expiry timestamp', async () => {
    const response = { code: 'ABCD1234', expires_at: '2026-05-11T13:00:00Z' }
    mockApiClient.post.mockResolvedValueOnce(response)
    const result = await bookingService.generateTelegramLinkCode()
    expect(result.code).toBe('ABCD1234')
    expect(result.expires_at).toBe('2026-05-11T13:00:00Z')
  })

  it('each call can return a different code (no assumed idempotency)', async () => {
    mockApiClient.post
      .mockResolvedValueOnce({ code: 'AAAA0001', expires_at: '2026-05-11T13:00:00Z' })
      .mockResolvedValueOnce({ code: 'BBBB0002', expires_at: '2026-05-11T13:15:00Z' })
    const first = await bookingService.generateTelegramLinkCode()
    const second = await bookingService.generateTelegramLinkCode()
    expect(first.code).not.toBe(second.code)
  })
})

// ─── getTelegramStatus ────────────────────────────────────────────────────────

describe('bookingService.getTelegramStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /me/telegram', async () => {
    mockApiClient.get.mockResolvedValueOnce({ linked: false })
    await bookingService.getTelegramStatus()
    expect(mockApiClient.get).toHaveBeenCalledWith('/me/telegram')
  })

  it('returns linked: false when bot is not connected', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      linked: false,
      telegram_username: null,
      linked_at: null,
    })
    const result = await bookingService.getTelegramStatus()
    expect(result.linked).toBe(false)
    expect(result.telegram_username).toBeNull()
  })

  it('returns linked: true with username when bot is connected', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      linked: true,
      telegram_username: '@abebe_hailu',
      linked_at: '2026-05-01T10:00:00Z',
    })
    const result = await bookingService.getTelegramStatus()
    expect(result.linked).toBe(true)
    expect(result.telegram_username).toBe('@abebe_hailu')
  })
})

// ─── createBooking ────────────────────────────────────────────────────────────

describe('bookingService.createBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /bookings with vehicle_id and date range', async () => {
    mockApiClient.post.mockResolvedValueOnce(sampleBooking)
    await bookingService.createBooking({
      vehicle_id: 3,
      pickup_datetime: '2026-05-15T08:00:00Z',
      expected_return_datetime: '2026-05-18T08:00:00Z',
    })
    expect(mockApiClient.post).toHaveBeenCalledWith('/bookings', {
      vehicle_id: 3,
      pickup_datetime: '2026-05-15T08:00:00Z',
      expected_return_datetime: '2026-05-18T08:00:00Z',
    })
  })

  it('new booking starts with booking_requested status', async () => {
    mockApiClient.post.mockResolvedValueOnce(sampleBooking)
    const result = await bookingService.createBooking({
      vehicle_id: 3,
      pickup_datetime: '2026-05-15T08:00:00Z',
      expected_return_datetime: '2026-05-18T08:00:00Z',
    })
    expect(result.status).toBe('booking_requested')
  })

  it('includes optional fields when provided', async () => {
    mockApiClient.post.mockResolvedValueOnce(sampleBooking)
    await bookingService.createBooking({
      vehicle_id: 3,
      pickup_datetime: '2026-05-15T08:00:00Z',
      expected_return_datetime: '2026-05-18T08:00:00Z',
      pickup_location: 'Bole Airport',
      notes: 'Need child seat',
    })
    expect(mockApiClient.post).toHaveBeenCalledWith('/bookings', {
      vehicle_id: 3,
      pickup_datetime: '2026-05-15T08:00:00Z',
      expected_return_datetime: '2026-05-18T08:00:00Z',
      pickup_location: 'Bole Airport',
      notes: 'Need child seat',
    })
  })
})

// ─── cancelBooking ────────────────────────────────────────────────────────────

describe('bookingService.cancelBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /bookings/:id/cancel', async () => {
    mockApiClient.post.mockResolvedValueOnce({ detail: 'Booking cancelled' })
    await bookingService.cancelBooking(7)
    expect(mockApiClient.post).toHaveBeenCalledWith('/bookings/7/cancel')
  })

  it('uses the correct booking id in the URL', async () => {
    mockApiClient.post.mockResolvedValueOnce({ detail: 'Booking cancelled' })
    await bookingService.cancelBooking(99)
    expect(mockApiClient.post).toHaveBeenCalledWith('/bookings/99/cancel')
  })
})

// ─── getMyBookings ────────────────────────────────────────────────────────────

describe('bookingService.getMyBookings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /bookings', async () => {
    mockApiClient.get.mockResolvedValueOnce([])
    await bookingService.getMyBookings()
    expect(mockApiClient.get).toHaveBeenCalledWith('/bookings')
  })

  it('returns an array of bookings', async () => {
    mockApiClient.get.mockResolvedValueOnce([activeBooking])
    const result = await bookingService.getMyBookings()
    expect(result).toHaveLength(1)
    expect(result[0].agreement_number).toBe('AGR-20260501-0007')
  })

  it('bookings include total_charge, total_paid, balance_due fields', async () => {
    mockApiClient.get.mockResolvedValueOnce([activeBooking])
    const result = await bookingService.getMyBookings()
    expect(result[0].total_charge).toBe('4500.00')
    expect(result[0].total_paid).toBe('0.00')
    expect(result[0].balance_due).toBe('4500.00')
  })

  it('returns empty array when customer has no bookings', async () => {
    mockApiClient.get.mockResolvedValueOnce([])
    const result = await bookingService.getMyBookings()
    expect(result).toEqual([])
  })
})

// ─── getVehicles / getVehicle ─────────────────────────────────────────────────

describe('bookingService.getVehicles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /vehicles', async () => {
    mockApiClient.get.mockResolvedValueOnce([sampleVehicle])
    await bookingService.getVehicles()
    expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles')
  })

  it('returns an array of public vehicles', async () => {
    mockApiClient.get.mockResolvedValueOnce([sampleVehicle])
    const result = await bookingService.getVehicles()
    expect(result).toHaveLength(1)
    expect(result[0].make).toBe('Toyota')
    expect(result[0].status).toBe('available')
  })
})

describe('bookingService.getVehicle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /vehicles/:id', async () => {
    mockApiClient.get.mockResolvedValueOnce(sampleVehicle)
    await bookingService.getVehicle(3)
    expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles/3')
  })

  it('returns a single vehicle object', async () => {
    mockApiClient.get.mockResolvedValueOnce(sampleVehicle)
    const result = await bookingService.getVehicle(3)
    expect(result.id).toBe(3)
    expect(result.daily_rate).toBe('1500.00')
  })
})
