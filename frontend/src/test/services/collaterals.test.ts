import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockApiClient = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }))
vi.mock('@/services/apiClient', () => ({ default: mockApiClient }))

import { collateralsService } from '@/services/collaterals'

describe('collateralsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('omits blank optional text fields when creating a collateral', async () => {
    mockApiClient.post.mockResolvedValue({ id: 24 })

    await collateralsService.create({
      customer_id: 24,
      first_name: 'Almaz',
      last_name: 'Bekele',
      phone_primary: '+251911223344',
      phone_secondary: '',
      email: '',
      relationship_to_customer: 'sibling',
      id_type: 'national_id',
      id_number: 'ID-24',
      house_number: '',
      notes: '',
    })

    expect(mockApiClient.post).toHaveBeenCalledWith('/collaterals', {
      customer_id: 24,
      first_name: 'Almaz',
      last_name: 'Bekele',
      phone_primary: '+251911223344',
      relationship_to_customer: 'sibling',
      id_type: 'national_id',
      id_number: 'ID-24',
    })
  })
})
