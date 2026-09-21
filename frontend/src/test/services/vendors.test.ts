import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  postFormData: vi.fn(),
  getBlob: vi.fn(),
}))
vi.mock('@/services/apiClient', async (importOriginal) => {
  // Keep the real getErrorMessage/getFieldErrors — only the client is mocked.
  const actual = await importOriginal<typeof import('@/services/apiClient')>()
  return { ...actual, default: mockApiClient, apiClient: mockApiClient }
})

import { vendorsService } from '@/services/vendors'
import { getErrorMessage, getFieldErrors } from '@/services/apiClient'

beforeEach(() => {
  vi.clearAllMocks()
  mockApiClient.post.mockResolvedValue({ id: 1 })
  mockApiClient.put.mockResolvedValue({ id: 1 })
})

describe('vendorsService payload serialization', () => {
  it('omits blank optional fields so an empty email does not 422', async () => {
    await vendorsService.create({
      vendor_type: 'company',
      company_name: 'QA Test Vendor',
      contact_person: '',
      phone_primary: '+251911000001',
      phone_secondary: '',
      email: '',
      address: '',
      city: '',
      bank_name: '',
      bank_account_number: '',
      bank_account_holder: '',
      notes: '',
    })

    const [, body] = mockApiClient.post.mock.calls[0]
    expect(body).toEqual({
      vendor_type: 'company',
      company_name: 'QA Test Vendor',
      phone_primary: '+251911000001',
    })
    expect(body).not.toHaveProperty('email')
  })

  it('keeps values that are genuinely provided', async () => {
    await vendorsService.create({
      vendor_type: 'individual',
      contact_person: 'Abebe Bekele',
      phone_primary: '+251911000002',
      email: 'abebe@example.com',
      commission_rate: '65.5',
    })

    const [, body] = mockApiClient.post.mock.calls[0]
    expect(body.email).toBe('abebe@example.com')
    expect(body.commission_rate).toBe('65.5')
  })

  it('strips blanks on update too', async () => {
    await vendorsService.update(7, { email: '', city: 'Addis Ababa' })

    const [, body] = mockApiClient.put.mock.calls[0]
    expect(body).toEqual({ city: 'Addis Ababa' })
  })

  it('preserves a zero commission rate', async () => {
    await vendorsService.create({
      vendor_type: 'company',
      company_name: 'Zero Commission',
      phone_primary: '+251911000003',
      commission_rate: 0,
    })

    const [, body] = mockApiClient.post.mock.calls[0]
    expect(body.commission_rate).toBe(0)
  })
})

describe('API error parsing', () => {
  // FastAPI returns this shape for request-validation failures.
  const validationError = {
    response: {
      data: {
        detail: [
          {
            loc: ['body', 'email'],
            msg: 'value is not a valid email address: An email address must have an @-sign.',
            type: 'value_error',
          },
          { loc: ['body', 'commission_rate'], msg: 'Input should be less than or equal to 100', type: 'less_than_equal' },
        ],
      },
    },
  }

  it('renders a 422 as readable text instead of [object Object]', () => {
    const message = getErrorMessage(validationError)
    expect(message).toContain('email')
    expect(message).toContain('commission_rate')
    expect(message).not.toContain('[object Object]')
  })

  it('maps a 422 onto field names with the body prefix dropped', () => {
    expect(getFieldErrors(validationError)).toEqual({
      email: 'value is not a valid email address: An email address must have an @-sign.',
      commission_rate: 'Input should be less than or equal to 100',
    })
  })

  it('passes a plain string detail through unchanged', () => {
    const err = { response: { data: { detail: 'Vendor already exists' } } }
    expect(getErrorMessage(err)).toBe('Vendor already exists')
    expect(getFieldErrors(err)).toEqual({})
  })

  it('falls back when there is no response body', () => {
    expect(getErrorMessage({ message: 'Network Error' })).toBe('Network Error')
    expect(getErrorMessage({}, 'Error creating vendor')).toBe('Error creating vendor')
  })
})
