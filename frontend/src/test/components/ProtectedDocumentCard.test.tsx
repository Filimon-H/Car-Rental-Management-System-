import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProtectedDocumentCard } from '@/components/documents/ProtectedDocumentCard'

const useProtectedFileUrl = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-protected-file-url', () => ({
  useProtectedFileUrl,
}))

describe('ProtectedDocumentCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useProtectedFileUrl.mockReturnValue({
      fileUrl: 'blob:http://localhost/document',
      isLoading: false,
      hasError: false,
    })
  })

  it('renders an authenticated image blob as a thumbnail', () => {
    render(
      <ProtectedDocumentCard
        ownerType="customer"
        ownerId={24}
        document={{ id: 13, doc_type: 'national_id', file_name: 'qa_front.jpg', mime_type: 'image/jpeg' }}
      />
    )

    expect(screen.getByRole('img', { name: 'qa_front.jpg' })).toHaveAttribute(
      'src',
      'blob:http://localhost/document'
    )
    expect(screen.getByRole('link', { name: 'common.download' })).toHaveAttribute('download', 'qa_front.jpg')
    expect(useProtectedFileUrl).toHaveBeenCalledWith('/customers/24/documents/13/file')
  })

  it('portals the image viewer to the document body and closes it with Escape', () => {
    render(
      <div className="translate-y-1 overflow-hidden">
        <ProtectedDocumentCard
          ownerType="customer"
          ownerId={24}
          document={{ id: 13, doc_type: 'national_id', file_name: 'qa_front.jpg', mime_type: 'image/jpeg' }}
        />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.view qa_front.jpg' }))
    const viewer = screen.getByRole('dialog', { name: 'qa_front.jpg' })
    expect(viewer.parentElement).toBe(document.body)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'qa_front.jpg' })).not.toBeInTheDocument()
  })

  it('opens a PDF blob in a new tab when its card is clicked', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(
      <ProtectedDocumentCard
        ownerType="collateral"
        ownerId={7}
        document={{ id: 14, doc_type: 'driver_license', file_name: 'qa_license.pdf', mime_type: 'application/pdf' }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.view qa_license.pdf' }))

    expect(open).toHaveBeenCalledWith(
      'blob:http://localhost/document',
      '_blank',
      'noopener,noreferrer'
    )
    expect(useProtectedFileUrl).toHaveBeenCalledWith('/collaterals/7/documents/14/file')
  })

  it('shows an error instead of an endless loading state when the request fails', () => {
    useProtectedFileUrl.mockReturnValue({ fileUrl: null, isLoading: false, hasError: true })

    render(
      <ProtectedDocumentCard
        ownerType="customer"
        ownerId={24}
        document={{ id: 13, doc_type: 'national_id', file_name: 'qa_front.jpg', mime_type: 'image/jpeg' }}
      />
    )

    expect(screen.getAllByText('customerDetail.documentLoadError')).toHaveLength(2)
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument()
  })
})
