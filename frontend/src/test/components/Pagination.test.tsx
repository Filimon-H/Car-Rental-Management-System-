import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from '@/components/ui/Pagination'

describe('Pagination', () => {
  it('renders nothing when there are no records', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={0} onPageChange={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('reports the visible range and total', () => {
    render(<Pagination page={2} pageSize={20} total={45} onPageChange={vi.fn()} />)

    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
  })

  it('caps the range at the total on the last page', () => {
    render(<Pagination page={3} pageSize={20} total={45} onPageChange={vi.fn()} />)

    // 41–45, not 41–60.
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getAllByText('45').length).toBeGreaterThan(0)
  })

  it('disables Previous on the first page', () => {
    render(<Pagination page={1} pageSize={20} total={45} onPageChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('disables Next on the last page', () => {
    render(<Pagination page={3} pageSize={20} total={45} onPageChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('steps forward and back', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} pageSize={20} total={45} onPageChange={onPageChange} />)

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onPageChange).toHaveBeenCalledWith(3)

    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('is exposed as a navigation landmark', () => {
    render(
      <Pagination page={1} pageSize={20} total={45} onPageChange={vi.fn()} label="Customer pages" />
    )

    expect(screen.getByRole('navigation', { name: 'Customer pages' })).toBeInTheDocument()
  })
})
