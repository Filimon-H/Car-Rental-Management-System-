import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Search/filters on the left, primary actions on the right; stacks when narrow. */
export function PageToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export interface FilterTab {
  value: string
  label: string
}

/**
 * Segmented filter control. Uses the tablist pattern so arrow keys move between
 * options the way a screen reader user expects.
 */
export function FilterTabs({
  tabs,
  value,
  onChange,
  label = 'Filter',
}: {
  tabs: FilterTab[]
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/5 sm:w-fit"
    >
      {tabs.map((tab) => {
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive
                ? 'bg-white text-slate-800 shadow-sm dark:bg-night-raised dark:text-slate-100'
                : // slate-600: the tab strip's slate-100 ground makes slate-500 fall to 4.3:1.
                  'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default PageToolbar
