import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterTabs } from '@/components/ui/PageToolbar'

const tabs = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
]

describe('FilterTabs', () => {
  it('exposes tabs with the tablist pattern', () => {
    render(<FilterTabs tabs={tabs} value="" onChange={vi.fn()} label="Filter by status" />)

    expect(screen.getByRole('tablist', { name: 'Filter by status' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('marks exactly one tab selected', () => {
    render(<FilterTabs tabs={tabs} value="active" onChange={vi.fn()} />)

    expect(screen.getByRole('tab', { name: 'Active', selected: true })).toBeInTheDocument()
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1)
  })

  it('reports the chosen value', async () => {
    const onChange = vi.fn()
    render(<FilterTabs tabs={tabs} value="" onChange={onChange} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Closed' }))

    expect(onChange).toHaveBeenCalledWith('closed')
  })
})
