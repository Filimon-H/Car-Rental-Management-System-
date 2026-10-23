import { cn } from '@/lib/utils'

/**
 * Shimmer placeholder. Sized by the caller via className so it can stand in for
 * whatever it is replacing (a cell, an avatar, a card).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-white/10', className)}
    />
  )
}

/** Row of shimmer cells matching a table's column count. */
export function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="border-b border-slate-100 dark:border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Skeleton className={cn('h-4', i === 0 ? 'w-24' : 'w-full max-w-[140px]')} />
        </td>
      ))}
    </tr>
  )
}
