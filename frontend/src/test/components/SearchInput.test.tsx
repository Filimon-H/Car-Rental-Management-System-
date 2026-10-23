import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput } from '@/components/ui/SearchInput'

describe('SearchInput', () => {
  it('is reachable by its accessible label', () => {
    render(<SearchInput value="" onChange={vi.fn()} label="Search customers" />)

    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toBeInTheDocument()
  })

  it('reports each keystroke to the caller', async () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} label="Search" />)

    await userEvent.type(screen.getByRole('searchbox'), 'ab')

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('offers a clear button only when there is text', () => {
    const { rerender } = render(<SearchInput value="" onChange={vi.fn()} label="Search" />)
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()

    rerender(<SearchInput value="abe" onChange={vi.fn()} label="Search" />)
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('clears to an empty string', async () => {
    const onChange = vi.fn()
    render(<SearchInput value="abe" onChange={onChange} label="Search" />)

    await userEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect(onChange).toHaveBeenCalledWith('')
  })
})
