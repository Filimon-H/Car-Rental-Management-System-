import type { ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkeletonRow } from './Skeleton'

export interface Column<T> {
  /** Stable key, also used as the React key for the cell. */
  key: string
  header: ReactNode
  /** Cell renderer. Receives the row and its index. */
  cell: (row: T, index: number) => ReactNode
  /** Extra classes for this column's cells (alignment, width, truncation). */
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  /** Stable row identity — used as the React key. */
  rowKey: (row: T, index: number) => string | number
  isLoading?: boolean
  error?: unknown
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyMessage?: string
  emptyAction?: ReactNode
  errorMessage?: string
  /** Rendered as a caption for screen readers; the visible heading lives outside. */
  caption?: string
  className?: string
}

/**
 * The shared table shell for every list page.
 *
 * It owns the states each page used to reimplement — loading, error, empty — plus
 * the horizontal scroll container that keeps wide tables from breaking the layout
 * on narrow screens.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'No records match the current filters.',
  emptyAction,
  errorMessage = 'Something went wrong while loading this list.',
  caption,
  className,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && !error && (!rows || rows.length === 0)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-night-surface dark:ring-night-border',
        className
      )}
    >
      {error ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{emptyTitle}</p>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">{emptyMessage}</p>
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      ) : (
        /* Wide tables scroll horizontally instead of forcing the page to. */
        <div className="overflow-x-auto">
          <table className="min-w-full">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-night-border dark:bg-white/5">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      // slate-600, not 400: column headers are real content and
                      // must clear WCAG AA (7.2:1 here vs 2.6:1 before).
                      'whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300',
                      col.headerClassName
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} columns={columns.length} />
                  ))
                : rows?.map((row, index) => (
                    <tr
                      key={rowKey(row, index)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onRowClick(row)
                              }
                            }
                          : undefined
                      }
                      // Clickable rows must be reachable and activatable by keyboard.
                      tabIndex={onRowClick ? 0 : undefined}
                      role={onRowClick ? 'button' : undefined}
                      className={cn(
                        'border-b border-slate-50 last:border-0 dark:border-white/5',
                        onRowClick &&
                          'cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-white/5 dark:focus:bg-white/5'
                      )}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-5 py-4 text-sm text-slate-700 dark:text-slate-300',
                            col.className
                          )}
                        >
                          {col.cell(row, index)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default DataTable
