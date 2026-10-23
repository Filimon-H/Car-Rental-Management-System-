import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Page stepper for the list pages. Announces itself as navigation and reports the
 * visible range so the position is clear without counting rows.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  label,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  label?: string
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  const buttonClass =
    'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-night-border dark:bg-night-raised dark:text-slate-300 dark:hover:bg-white/5'

  return (
    <nav
      aria-label={label ?? t('pagination.label')}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('pagination.showing')}{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{first}</span>–
        <span className="font-medium text-slate-700 dark:text-slate-200">{last}</span>{' '}
        {t('pagination.of')}{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={buttonClass}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.previous')}
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {t('pagination.pageOf', { page, totalPages })}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={buttonClass}
        >
          {t('common.next')}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export default Pagination
