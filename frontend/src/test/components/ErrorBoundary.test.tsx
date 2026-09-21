import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('boom from render')
  return <div>recovered content</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors to console.error; silence it to keep output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('shows a recoverable panel instead of crashing when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('custom fallback')).toBeInTheDocument()
  })

  it('clears the error when resetKey changes, so navigation recovers', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('recovered content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('recovers when "Try again" is clicked and the child no longer throws', () => {
    // A module-level flag flipped between renders, so the retry re-renders a
    // child that now succeeds.
    let shouldThrow = true
    function Flaky() {
      if (shouldThrow) throw new Error('render fails while flag is set')
      return <div>retry works</div>
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByText('retry works')).toBeInTheDocument()
  })
})
