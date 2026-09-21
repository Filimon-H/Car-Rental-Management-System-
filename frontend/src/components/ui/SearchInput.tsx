import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Labelled search box. The label is visually hidden but present, so the input is
 * announced properly instead of being an anonymous textbox.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  label = 'Search',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  const id = useId()

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-500 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-night-border dark:bg-night-raised dark:text-slate-100 dark:placeholder-slate-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export default SearchInput
