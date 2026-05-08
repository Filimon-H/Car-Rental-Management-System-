import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { agreementsService, availabilityService } from '@/services/agreements'

const sampleAgreement = {
  id: 1,
  agreement_number: 'AGR-20240101-0001',
  agreement_type: 'customer_vehicle' as const,
  status: 'pending_payment' as const,
  customer_id: 1,
  customer_name: 'Abebe Bekele',
  pickup_datetime: '2024-01-10T08:00:00Z',
  expected_return_datetime: '2024-01-13T08:00:00Z',
  actual_return_datetime: null,
  agreed_daily_rate: 1500,
  deposit_amount: 5000,
  advance_payment: undefined,
  pickup_location: 'Bole',
  return_location: 'Bole',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  closed_at: null,
}

describe('agreementsService', () => {
  beforeEach(() => vi.clearAllMocks())

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('calls GET /agreements with no params', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
      await agreementsService.list()
      expect(mockApiClient.get).toHaveBeenCalledWith('/agreements', undefined)
    })

    it('passes status filter param', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
      await agreementsService.list({ status: 'active' })
      expect(mockApiClient.get).toHaveBeenCalledWith('/agreements', { status: 'active' })
    })

    it('returns list response', async () => {
      const response = { items: [sampleAgreement], total: 1, page: 1, page_size: 20 }
      mockApiClient.get.mockResolvedValueOnce(response)
      const result = await agreementsService.list()
      expect(result.total).toBe(1)
      expect(result.items[0].agreement_number).toBe('AGR-20240101-0001')
    })
  })

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  describe('getById', () => {
    it('calls GET /agreements/:id', async () => {
      mockApiClient.get.mockResolvedValueOnce({ ...sampleAgreement, vehicle_segments: [], balance: 4500 })
      await agreementsService.getById(1)
      expect(mockApiClient.get).toHaveBeenCalledWith('/agreements/1')
    })
  })

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('calls POST /agreements with the data', async () => {
      mockApiClient.post.mockResolvedValueOnce(sampleAgreement)
      const data = {
        customer_id: 1,
        vehicle_id: 5,
        pickup_datetime: '2024-01-10T08:00:00Z',
        expected_return_datetime: '2024-01-13T08:00:00Z',
        daily_rate: 1500,
      }
      await agreementsService.create(data)
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements', data)
    })
  })

  // ---------------------------------------------------------------------------
  // activate
  // ---------------------------------------------------------------------------

  describe('activate', () => {
    it('calls POST /agreements/:id/activate', async () => {
      mockApiClient.post.mockResolvedValueOnce({ ...sampleAgreement, status: 'active' })
      await agreementsService.activate(1)
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/activate')
    })
  })

  // ---------------------------------------------------------------------------
  // extend
  // ---------------------------------------------------------------------------

  describe('extend', () => {
    it('calls POST /agreements/:id/extend with new return datetime', async () => {
      mockApiClient.post.mockResolvedValueOnce(sampleAgreement)
      await agreementsService.extend(1, '2024-01-16T08:00:00Z')
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/extend', {
        new_return_datetime: '2024-01-16T08:00:00Z',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // close
  // ---------------------------------------------------------------------------

  describe('close', () => {
    it('calls POST /agreements/:id/close with return details', async () => {
      mockApiClient.post.mockResolvedValueOnce({ ...sampleAgreement, status: 'closed' })
      await agreementsService.close(1, {
        actual_return_datetime: '2024-01-13T09:00:00Z',
        return_mileage: 52000,
        notes: 'Good condition',
      })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/close', {
        actual_return_datetime: '2024-01-13T09:00:00Z',
        return_mileage: 52000,
        notes: 'Good condition',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // markReturned
  // ---------------------------------------------------------------------------

  describe('markReturned', () => {
    it('calls POST /agreements/:id/return', async () => {
      mockApiClient.post.mockResolvedValueOnce({ ...sampleAgreement, status: 'returned' })
      await agreementsService.markReturned(1, { actual_return_datetime: '2024-01-13T09:00:00Z' })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/return', {
        actual_return_datetime: '2024-01-13T09:00:00Z',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // postPayment
  // ---------------------------------------------------------------------------

  describe('postPayment', () => {
    it('calls POST /agreements/:id/payments with payment data', async () => {
      const entry = { id: 10, entry_type: 'payment', amount: -1500, description: 'Payment' }
      mockApiClient.post.mockResolvedValueOnce(entry)
      await agreementsService.postPayment(1, {
        amount: 1500,
        payment_method: 'cash',
        description: 'Partial payment',
      })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/payments', {
        amount: 1500,
        payment_method: 'cash',
        description: 'Partial payment',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // receiveDeposit
  // ---------------------------------------------------------------------------

  describe('receiveDeposit', () => {
    it('calls POST /agreements/:id/deposits', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await agreementsService.receiveDeposit(1, { amount: 5000, payment_method: 'cash' })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/deposits', {
        amount: 5000,
        payment_method: 'cash',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // applyDeposit
  // ---------------------------------------------------------------------------

  describe('applyDeposit', () => {
    it('calls POST /agreements/:id/deposits/apply', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await agreementsService.applyDeposit(1, { amount: 3000 })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/deposits/apply', {
        amount: 3000,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // refundDeposit
  // ---------------------------------------------------------------------------

  describe('refundDeposit', () => {
    it('calls POST /agreements/:id/deposits/refund', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await agreementsService.refundDeposit(1, { amount: 2000, notes: 'Partial refund' })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/deposits/refund', {
        amount: 2000,
        notes: 'Partial refund',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // postDamageCharge
  // ---------------------------------------------------------------------------

  describe('postDamageCharge', () => {
    it('calls POST /agreements/:id/charges/damage', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await agreementsService.postDamageCharge(1, { amount: 800, description: 'Scratch on door' })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/charges/damage', {
        amount: 800,
        description: 'Scratch on door',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // postAdjustment
  // ---------------------------------------------------------------------------

  describe('postAdjustment', () => {
    it('calls POST /agreements/:id/adjustments', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await agreementsService.postAdjustment(1, { amount: -200, description: 'Loyalty discount' })
      expect(mockApiClient.post).toHaveBeenCalledWith('/agreements/1/adjustments', {
        amount: -200,
        description: 'Loyalty discount',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // getLedger
  // ---------------------------------------------------------------------------

  describe('getLedger', () => {
    it('calls GET /agreements/:id/ledger', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await agreementsService.getLedger(1)
      expect(mockApiClient.get).toHaveBeenCalledWith('/agreements/1/ledger')
    })
  })
})

// ---------------------------------------------------------------------------
// availabilityService
// ---------------------------------------------------------------------------

describe('availabilityService', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getAvailableVehicles', () => {
    it('calls GET /availability/vehicles with date params', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await availabilityService.getAvailableVehicles('2024-01-10T08:00:00Z', '2024-01-13T08:00:00Z')
      expect(mockApiClient.get).toHaveBeenCalledWith('/availability/vehicles', {
        start_datetime: '2024-01-10T08:00:00Z',
        end_datetime: '2024-01-13T08:00:00Z',
        vehicle_type: undefined,
      })
    })

    it('passes vehicle_type filter when provided', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await availabilityService.getAvailableVehicles(
        '2024-01-10T08:00:00Z',
        '2024-01-13T08:00:00Z',
        'sedan'
      )
      expect(mockApiClient.get).toHaveBeenCalledWith('/availability/vehicles', {
        start_datetime: '2024-01-10T08:00:00Z',
        end_datetime: '2024-01-13T08:00:00Z',
        vehicle_type: 'sedan',
      })
    })
  })

  describe('checkVehicle', () => {
    it('calls GET /availability/check/:vehicleId', async () => {
      mockApiClient.get.mockResolvedValueOnce({ vehicle_id: 5, available: true, message: null })
      await availabilityService.checkVehicle(5, '2024-01-10T08:00:00Z', '2024-01-13T08:00:00Z')
      expect(mockApiClient.get).toHaveBeenCalledWith('/availability/check/5', {
        start_datetime: '2024-01-10T08:00:00Z',
        end_datetime: '2024-01-13T08:00:00Z',
        exclude_agreement_id: undefined,
      })
    })

    it('passes exclude_agreement_id when provided', async () => {
      mockApiClient.get.mockResolvedValueOnce({ vehicle_id: 5, available: true, message: null })
      await availabilityService.checkVehicle(5, '2024-01-10T08:00:00Z', '2024-01-13T08:00:00Z', 99)
      expect(mockApiClient.get).toHaveBeenCalledWith('/availability/check/5', {
        start_datetime: '2024-01-10T08:00:00Z',
        end_datetime: '2024-01-13T08:00:00Z',
        exclude_agreement_id: 99,
      })
    })
  })
})
