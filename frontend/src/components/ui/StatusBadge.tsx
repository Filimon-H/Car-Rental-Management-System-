import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'purple'

/**
 * Status vocabulary shared by every list and detail page. Adding a status here
 * makes it render consistently everywhere instead of each page inventing its own
 * colour and casing.
 */
const TONES: Record<Tone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  success:
    'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  warning:
    'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  muted: 'bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
}

const DOTS: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  muted: 'bg-slate-300',
  purple: 'bg-purple-500',
}

const STATUS_TONES: Record<string, Tone> = {
  // Agreements
  booking_requested: 'warning',
  draft: 'neutral',
  pending_payment: 'info',
  active: 'success',
  closed: 'info',
  overdue: 'danger',
  cancelled: 'muted',
  // Vehicles
  available: 'success',
  rented: 'info',
  maintenance: 'warning',
  reserved: 'purple',
  retired: 'muted',
  out_of_service: 'danger',
  // Generic
  paid: 'success',
  unpaid: 'danger',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  inactive: 'muted',
}

/** snake_case -> Title Case, so new statuses read correctly without a lookup entry. */
function humanize(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label?: string
  className?: string
}) {
  const tone = STATUS_TONES[status] ?? 'neutral'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />
      {label ?? humanize(status)}
    </span>
  )
}

export default StatusBadge
