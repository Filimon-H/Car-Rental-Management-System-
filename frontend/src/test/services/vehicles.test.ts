import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  postFormData: vi.fn(),
}))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { vehiclesService } from '@/services/vehicles'

const sampleVehicle = {
  id: 1,
  vendor_id: 1,
  vendor: null,
  plate_number: 'AA-00001',
  plate_code: '01',
  plate_city: 'AA',
  make: 'Toyota',
  model: 'Corolla',
  year: 2022,
  color: 'White',
  vehicle_type: 'sedan',
  service_type: 'business',
  car_condition: 'good',
  motor_number: null,
  chassis_number: null,
  seats: 5,
  transmission: 'automatic',
  fuel_type: 'petrol',
  daily_rate: 1500,
  status: 'available' as const,
  insurance_policy_number: null,
  insurance_expiry: null,
  photo_front: null,
  photo_back: null,
  photo_left: null,
  photo_right: null,
  current_mileage: 0,
  notes: null,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('vehiclesService', () => {
  beforeEach(() => vi.clearAllMocks())

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('calls GET /vehicles with no params', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
      await vehiclesService.list()
      expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles', undefined)
    })

    it('passes status filter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
      await vehiclesService.list({ status: 'available' })
      expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles', { status: 'available' })
    })

    it('returns paginated list response', async () => {
      const response = { items: [sampleVehicle], total: 1, page: 1, page_size: 20 }
      mockApiClient.get.mockResolvedValueOnce(response)
      const result = await vehiclesService.list()
      expect(result.total).toBe(1)
      expect(result.items[0].plate_number).toBe('AA-00001')
    })
  })

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  describe('search', () => {
    it('calls GET /vehicles/search with query and defaults', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await vehiclesService.search('Toyota')
      expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles/search', {
        q: 'Toyota',
        limit: 10,
        available_only: false,
      })
    })

    it('passes availableOnly flag', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await vehiclesService.search('Toyota', 5, true)
      expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles/search', {
        q: 'Toyota',
        limit: 5,
        available_only: true,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  describe('getById', () => {
    it('calls GET /vehicles/:id', async () => {
      mockApiClient.get.mockResolvedValueOnce(sampleVehicle)
      await vehiclesService.getById(1)
      expect(mockApiClient.get).toHaveBeenCalledWith('/vehicles/1')
    })

    it('returns the vehicle', async () => {
      mockApiClient.get.mockResolvedValueOnce(sampleVehicle)
      const result = await vehiclesService.getById(1)
      expect(result).toEqual(sampleVehicle)
    })
  })

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('calls POST /vehicles with vehicle data', async () => {
      mockApiClient.post.mockResolvedValueOnce(sampleVehicle)
      const data = {
        vendor_id: 1,
        plate_number: 'AA-00001',
        plate_code: '01',
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        color: 'White',
        vehicle_type: 'sedan',
        service_type: 'business',
        daily_rate: 1500,
      }
      await vehiclesService.create(data)
      expect(mockApiClient.post).toHaveBeenCalledWith('/vehicles', data)
    })
  })

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('calls PUT /vehicles/:id with partial data', async () => {
      mockApiClient.put.mockResolvedValueOnce({ ...sampleVehicle, color: 'Black' })
      await vehiclesService.update(1, { color: 'Black' })
      expect(mockApiClient.put).toHaveBeenCalledWith('/vehicles/1', { color: 'Black' })
    })
  })

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('calls PATCH /vehicles/:id/status', async () => {
      mockApiClient.patch.mockResolvedValueOnce({ ...sampleVehicle, status: 'maintenance' })
      await vehiclesService.updateStatus(1, 'maintenance', 'Scheduled service')
      expect(mockApiClient.patch).toHaveBeenCalledWith('/vehicles/1/status', {
        status: 'maintenance',
        notes: 'Scheduled service',
      })
    })

    it('sends undefined notes when not provided', async () => {
      mockApiClient.patch.mockResolvedValueOnce({ ...sampleVehicle, status: 'available' })
      await vehiclesService.updateStatus(1, 'available')
      expect(mockApiClient.patch).toHaveBeenCalledWith('/vehicles/1/status', {
        status: 'available',
        notes: undefined,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    it('calls DELETE /vehicles/:id', async () => {
      mockApiClient.delete.mockResolvedValueOnce(undefined)
      await vehiclesService.delete(1)
      expect(mockApiClient.delete).toHaveBeenCalledWith('/vehicles/1')
    })
  })

  // ---------------------------------------------------------------------------
  // uploadPhotos
  // ---------------------------------------------------------------------------

  describe('uploadPhotos', () => {
    it('appends only provided photos to FormData and calls postFormData', async () => {
      mockApiClient.postFormData.mockResolvedValueOnce(sampleVehicle)
      const frontFile = new File(['img'], 'front.jpg', { type: 'image/jpeg' })
      await vehiclesService.uploadPhotos(1, { front: frontFile, back: null })
      expect(mockApiClient.postFormData).toHaveBeenCalledWith(
        '/vehicles/1/photos',
        expect.any(FormData)
      )
    })

    it('skips null photo files', async () => {
      mockApiClient.postFormData.mockResolvedValueOnce(sampleVehicle)
      const appendSpy = vi.spyOn(FormData.prototype, 'append')
      await vehiclesService.uploadPhotos(1, { front: null, back: null, left: null, right: null })
      expect(appendSpy).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // getLookupDefaults
  // ---------------------------------------------------------------------------

  describe('getLookupDefaults', () => {
    it('calls GET /lookups/defaults', async () => {
      mockApiClient.get.mockResolvedValueOnce({})
      await vehiclesService.getLookupDefaults()
      expect(mockApiClient.get).toHaveBeenCalledWith('/lookups/defaults')
    })
  })
})
