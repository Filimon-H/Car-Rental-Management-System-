import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  postFormData: vi.fn(),
  getBlob: vi.fn(),
}))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { customersService } from '@/services/customers'

const sampleCustomer = {
  id: 1,
  business_type: 'individual',
  company_name: null,
  tin_number: null,
  first_name: 'Abebe',
  last_name: 'Bekele',
  full_name: 'Abebe Bekele',
  phone_primary: '0911000001',
  phone_secondary: null,
  email: null,
  id_type: 'passport',
  id_number: 'ET001',
  id_expiry_date: null,
  driver_license_number: 'DL-001',
  driver_license_expiry: null,
  house_number: null,
  wereda: null,
  subcity: null,
  city: 'Addis Ababa',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('customersService', () => {
  beforeEach(() => vi.clearAllMocks())

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('calls GET /customers with no params', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
      await customersService.list()
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers', undefined)
    })

    it('passes query params when provided', async () => {
      mockApiClient.get.mockResolvedValueOnce({ items: [], total: 0, page: 2, page_size: 10 })
      await customersService.list({ page: 2, page_size: 10, search: 'Abebe' })
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers', {
        page: 2,
        page_size: 10,
        search: 'Abebe',
      })
    })

    it('returns the response from apiClient', async () => {
      const response = { items: [sampleCustomer], total: 1, page: 1, page_size: 20 }
      mockApiClient.get.mockResolvedValueOnce(response)
      const result = await customersService.list()
      expect(result).toEqual(response)
    })
  })

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  describe('search', () => {
    it('calls GET /customers/search with query and default limit', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await customersService.search('Abebe')
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers/search', { q: 'Abebe', limit: 10 })
    })

    it('uses custom limit when provided', async () => {
      mockApiClient.get.mockResolvedValueOnce([])
      await customersService.search('Tigist', 5)
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers/search', { q: 'Tigist', limit: 5 })
    })
  })

  // ---------------------------------------------------------------------------
  // checkDuplicate
  // ---------------------------------------------------------------------------

  describe('checkDuplicate', () => {
    it('calls GET /customers/check-duplicate with the given params', async () => {
      const result = { duplicate: false, customer_id: null, match: null }
      mockApiClient.get.mockResolvedValueOnce(result)
      await customersService.checkDuplicate({ id_number: 'ET001' })
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers/check-duplicate', {
        id_number: 'ET001',
      })
    })

    it('returns true when a duplicate is found', async () => {
      const result = { duplicate: true, customer_id: 5, customer_name: 'Abebe', match: 'id_number' }
      mockApiClient.get.mockResolvedValueOnce(result)
      const r = await customersService.checkDuplicate({ id_number: 'ET001' })
      expect(r.duplicate).toBe(true)
      expect(r.customer_id).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  describe('getById', () => {
    it('calls GET /customers/:id', async () => {
      mockApiClient.get.mockResolvedValueOnce(sampleCustomer)
      await customersService.getById(1)
      expect(mockApiClient.get).toHaveBeenCalledWith('/customers/1')
    })

    it('returns the customer object', async () => {
      mockApiClient.get.mockResolvedValueOnce(sampleCustomer)
      const result = await customersService.getById(1)
      expect(result).toEqual(sampleCustomer)
    })
  })

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('calls POST /customers with the data', async () => {
      mockApiClient.post.mockResolvedValueOnce(sampleCustomer)
      const data = {
        business_type: 'individual',
        first_name: 'Abebe',
        last_name: 'Bekele',
        phone_primary: '0911000001',
      }
      await customersService.create(data)
      expect(mockApiClient.post).toHaveBeenCalledWith('/customers', data)
    })

    it('returns the created customer', async () => {
      mockApiClient.post.mockResolvedValueOnce(sampleCustomer)
      const result = await customersService.create({
        business_type: 'individual',
        first_name: 'Abebe',
        last_name: 'Bekele',
        phone_primary: '0911000001',
      })
      expect(result).toEqual(sampleCustomer)
    })
  })

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('calls PUT /customers/:id with the patch data', async () => {
      const updated = { ...sampleCustomer, city: 'Dire Dawa' }
      mockApiClient.put.mockResolvedValueOnce(updated)
      await customersService.update(1, { city: 'Dire Dawa' })
      expect(mockApiClient.put).toHaveBeenCalledWith('/customers/1', { city: 'Dire Dawa' })
    })
  })

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    it('calls DELETE /customers/:id', async () => {
      mockApiClient.delete.mockResolvedValueOnce(undefined)
      await customersService.delete(1)
      expect(mockApiClient.delete).toHaveBeenCalledWith('/customers/1')
    })
  })

  // ---------------------------------------------------------------------------
  // bulkUpload
  // ---------------------------------------------------------------------------

  describe('bulkUpload', () => {
    it('appends file to FormData and calls postFormData', async () => {
      const result = {
        total_rows: 2,
        successful: 2,
        failed: 0,
        errors: [],
        created_ids: [10, 11],
      }
      mockApiClient.postFormData.mockResolvedValueOnce(result)

      const file = new File(['col1,col2\nval1,val2'], 'customers.csv', { type: 'text/csv' })
      const r = await customersService.bulkUpload(file)

      expect(mockApiClient.postFormData).toHaveBeenCalledWith(
        '/customers/bulk-upload',
        expect.any(FormData)
      )
      expect(r).toEqual(result)
    })
  })

  // ---------------------------------------------------------------------------
  // downloadBulkTemplate
  // ---------------------------------------------------------------------------

  describe('downloadBulkTemplate', () => {
    it('calls getBlob for the template URL', async () => {
      const blob = new Blob(['csv content'], { type: 'text/csv' })
      mockApiClient.getBlob.mockResolvedValueOnce(blob)

      // Mock DOM methods used by the download
      const createObjectURL = vi.fn(() => 'blob:http://localhost/test')
      const revokeObjectURL = vi.fn()
      window.URL.createObjectURL = createObjectURL
      window.URL.revokeObjectURL = revokeObjectURL

      const clickSpy = vi.fn()
      const appendSpy = vi.fn()
      const removeSpy = vi.fn()
      vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy)
      vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy)
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy)

      await customersService.downloadBulkTemplate()

      expect(mockApiClient.getBlob).toHaveBeenCalledWith('/customers/bulk-upload/template')
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalled()
    })
  })
})
