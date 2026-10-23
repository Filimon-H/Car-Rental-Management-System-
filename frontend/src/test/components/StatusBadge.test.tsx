import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/ui/StatusBadge'

describe('StatusBadge', () => {
  it('humanizes a snake_case status', () => {
    render(<StatusBadge status="booking_requested" />)

    expect(screen.getByText('Booking Requested')).toBeInTheDocument()
  })

  it('prefers an explicit label', () => {
    render(<StatusBadge status="active" label="In progress" />)

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('renders an unknown status rather than breaking', () => {
    render(<StatusBadge status="some_new_state" />)

    expect(screen.getByText('Some New State')).toBeInTheDocument()
  })

  it('gives different statuses different styling', () => {
    const { container: activeEl } = render(<StatusBadge status="active" />)
    const { container: overdueEl } = render(<StatusBadge status="overdue" />)

    expect(activeEl.firstChild).not.toHaveClass(
      ...Array.from((overdueEl.firstChild as HTMLElement).classList)
    )
  })
})
