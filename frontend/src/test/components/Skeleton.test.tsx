import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

describe('Skeleton', () => {
  it('is hidden from assistive tech — it conveys nothing to a screen reader', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies caller sizing', () => {
    const { container } = render(<Skeleton className="h-8 w-40" />)

    expect(container.firstChild).toHaveClass('h-8', 'w-40')
  })
})

describe('SkeletonRow', () => {
  it('renders one cell per column so the placeholder matches the real table', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow columns={5} />
        </tbody>
      </table>
    )

    expect(container.querySelectorAll('td')).toHaveLength(5)
  })
})
