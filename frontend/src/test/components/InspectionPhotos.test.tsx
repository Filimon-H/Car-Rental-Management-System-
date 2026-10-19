/**
 * Inspection photos: who may change them, and when.
 *
 * Photos settle damage disputes, so they follow the server's rule — editable
 * until the inspection is signed, and only by admin and inspectors.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Load the real English strings explicitly, so assertions do not depend on
// whether some imported module happens to initialise i18n.
import '@/i18n'
import { InspectionPhotos } from '@/components/inspections/InspectionPhotos'
import apiClient from '@/services/apiClient'
import { useAuthStore } from '@/services/auth'

vi.mock('@/hooks/use-protected-file-url', () => ({
  useProtectedFileUrl: () => ({ fileUrl: 'blob:photo', isLoading: false, hasError: false }),
}))

const PHOTO = { id: 3, inspection_id: 9, filename: 'bumper.jpg', caption: 'Front bumper', category: 'damage', created_at: '' }

function renderIt(role: string, status: string) {
  useAuthStore.setState({ user: { id: 1, role }, isAuthenticated: true } as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InspectionPhotos inspectionId={9} status={status} />
    </QueryClientProvider>
  )
}

beforeEach(() => vi.restoreAllMocks())

describe('who may change photos', () => {
  it('an inspector can add and delete on an unsigned inspection', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([PHOTO])
    renderIt('inspector', 'completed')
    expect(await screen.findByAltText('Front bumper')).toBeInTheDocument()
    expect(screen.getByText('Add photos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete photo: Front bumper' })).toBeInTheDocument()
  })

  it('a signed inspection is locked even for an inspector', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([PHOTO])
    renderIt('inspector', 'signed')
    await screen.findByAltText('Front bumper')
    expect(screen.queryByText('Add photos')).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete photo/ })).toBeNull()
    expect(screen.getByText(/signed, so its photos can no longer change/)).toBeInTheDocument()
  })

  it('fleet staff can view but not change them', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([PHOTO])
    renderIt('fleet', 'draft')
    await screen.findByAltText('Front bumper')
    expect(screen.queryByText('Add photos')).toBeNull()
  })
})

describe('uploading', () => {
  it('sends each photo and refuses a non-image without sending it', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([])
    const post = vi.spyOn(apiClient, 'postFormData').mockResolvedValue({})
    renderIt('inspector', 'draft')

    await screen.findByText('No photos attached yet.')
    const input = document.getElementById('inspection-photo-input-9') as HTMLInputElement
    const good = new File(['x'], 'scratch.jpg', { type: 'image/jpeg' })
    const bad = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [good, bad] } })

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/inspections/9/photos')
    expect((post.mock.calls[0][1] as FormData).get('file')).toBe(good)
    expect(screen.getByRole('alert')).toHaveTextContent('notes.pdf')
  })
})
