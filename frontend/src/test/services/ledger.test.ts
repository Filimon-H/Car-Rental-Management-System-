/**
 * Tests for ledgerService — reverse entry and financial summary endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { ledgerService } from '@/services/agreements'

// ─── Sample data ─────────────────────────────────────────────────────────────

const samplePeriods = [
  {
    period: '2026-01',
    total_charged: 165000.0,
    total_payments: 80000.0,
    total_deposits: 10000.0,
    vendor_paid: 50000.0,
    net_revenue: 30000.0,
  },
  {
    period: '2026-05',
    total_charged: 291500.0,
    total_payments: 200000.0,
    total_deposits: 20000.0,
    vendor_paid: 140000.0,
    net_revenue: 60000.0,
  },
]

// ─── ledgerService.getSummary ─────────────────────────────────────────────────

describe('ledgerService', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getSummary', () => {
    it('calls GET /ledger/summary/periods with monthly granularity', async () => {
      mockApiClient.get.mockResolvedValueOnce(samplePeriods)
      await ledgerService.getSummary('monthly')
      expect(mockApiClient.get).toHaveBeenCalledWith('/ledger/summary/periods', {
        granularity: 'monthly',
      })
    })

    it('calls GET /ledger/summary/periods with daily granularity', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await ledgerService.getSummary('daily')
      expect(mockApiClient.get).toHaveBeenCalledWith('/ledger/summary/periods', {
        granularity: 'daily',
      })
    })

    it('calls GET /ledger/summary/periods with yearly granularity', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await ledgerService.getSummary('yearly')
      expect(mockApiClient.get).toHaveBeenCalledWith('/ledger/summary/periods', {
        granularity: 'yearly',
      })
    })

    it('returns the array of period summaries', async () => {
      mockApiClient.get.mockResolvedValueOnce(samplePeriods)
      const result = await ledgerService.getSummary('monthly')
      expect(result).toHaveLength(2)
      expect(result[0].period).toBe('2026-01')
      expect(result[1].period).toBe('2026-05')
    })

    it('each period has all required numeric fields', async () => {
      mockApiClient.get.mockResolvedValueOnce(samplePeriods)
      const result = await ledgerService.getSummary('monthly')
      for (const row of result) {
        expect(typeof row.total_charged).toBe('number')
        expect(typeof row.total_payments).toBe('number')
        expect(typeof row.total_deposits).toBe('number')
        expect(typeof row.vendor_paid).toBe('number')
        expect(typeof row.net_revenue).toBe('number')
      }
    })

    it('net_revenue equals total_payments minus vendor_paid', async () => {
      mockApiClient.get.mockResolvedValueOnce(samplePeriods)
      const result = await ledgerService.getSummary('monthly')
      for (const row of result) {
        expect(row.net_revenue).toBeCloseTo(row.total_payments - row.vendor_paid, 2)
      }
    })

    it('returns empty array when there is no data', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      const result = await ledgerService.getSummary('monthly')
      expect(result).toEqual([])
    })

    it('periods are returned in the order the API provides them', async () => {
      mockApiClient.get.mockResolvedValueOnce(samplePeriods)
      const result = await ledgerService.getSummary('monthly')
      expect(result[0].period).toBe('2026-01')
      expect(result[1].period).toBe('2026-05')
    })
  })

  describe('reverseEntry', () => {
    it('calls POST /ledger/entries/:id/reverse with reason', async () => {
      const reversed = { id: 99, entry_type: 'reversal', amount: -1500 }
      mockApiClient.post.mockResolvedValueOnce(reversed)
      await ledgerService.reverseEntry(10, 'Entered in error')
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/ledger/entries/10/reverse',
        { reason: 'Entered in error' }
      )
    })

    it('returns the new reversal entry', async () => {
      const reversed = { id: 99, entry_type: 'reversal', amount: -1500 }
      mockApiClient.post.mockResolvedValueOnce(reversed)
      const result = await ledgerService.reverseEntry(10, 'Entered in error')
      expect(result.entry_type).toBe('reversal')
    })

    it('uses the entry id from the argument in the URL', async () => {
      mockApiClient.post.mockResolvedValueOnce({})
      await ledgerService.reverseEntry(42, 'reason')
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/ledger/entries/42/reverse',
        expect.any(Object)
      )
    })
  })
})
