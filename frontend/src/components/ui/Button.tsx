import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-white shadow-sm hover:bg-primary-700 dark:bg-orange-brand dark:hover:bg-orange-dark',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-night-border dark:bg-night-raised dark:text-slate-200 dark:hover:bg-white/5',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  ghost:
    'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-night-canvas',
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

export default Button
