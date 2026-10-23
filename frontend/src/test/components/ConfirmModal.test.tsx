import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

const base = {
  title: 'Activate this agreement?',
  message: 'This confirms the vehicle has been handed over.',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

describe('ConfirmModal', () => {
  it('renders as a labelled dialog rather than a native confirm', () => {
    render(<ConfirmModal {...base} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(base.title)).toBeInTheDocument()
    expect(screen.getByText(base.message)).toBeInTheDocument()
  })

  it('calls onConfirm when confirmed', () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal {...base} onConfirm={onConfirm} confirmLabel="Activate" />)
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onClose without confirming when dismissed', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmModal {...base} onConfirm={onConfirm} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables the confirm button while the action is running', () => {
    render(<ConfirmModal {...base} confirmLabel="Activate" isLoading />)
    // The label switches to the loading text, so match by role position.
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 1]).toBeDisabled()
  })
})
