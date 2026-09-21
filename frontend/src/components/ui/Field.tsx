import { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * Form controls with their label, hint and error wired together.
 *
 * Form markup across the pages repeats a `<label>` and an `<input>` as
 * siblings, with no `id`/`htmlFor` between them — so a screen reader announces
 * an unlabelled textbox, and clicking the label does not focus the field. The
 * control styles were also pasted inline in four slightly different spellings,
 * one of which hardcoded `blue-500` instead of the primary token.
 *
 * These components generate the id, associate every part (label, hint, error)
 * through `aria-describedby`/`aria-invalid`, and keep the styling in one place.
 */

const CONTROL = [
  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
  'bg-white text-slate-900 placeholder-slate-500',
  'focus:outline-none focus:ring-2',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'dark:bg-night-raised dark:text-slate-100 dark:placeholder-slate-400',
].join(' ')

const CONTROL_DEFAULT =
  'border-slate-200 focus:border-primary focus:ring-primary/20 dark:border-night-border'

// Invalid state is carried by colour *and* the aria-invalid attribute, so it is
// not communicated by colour alone.
const CONTROL_INVALID =
  'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'

interface FieldShellProps {
  label: string
  /** Hide the label visually but keep it for assistive tech. */
  hideLabel?: boolean
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: (props: {
    id: string
    describedBy: string | undefined
    invalid: boolean
    controlClass: string
  }) => ReactNode
}

function FieldShell({
  label,
  hideLabel,
  hint,
  error,
  required,
  className,
  children,
}: FieldShellProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const invalid = Boolean(error)

  // Point the control at whichever descriptions actually exist.
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={id}
        className={cn(
          'block text-sm font-medium text-slate-700 dark:text-slate-200',
          hideLabel && 'sr-only'
        )}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        describedBy,
        invalid,
        controlClass: cn(CONTROL, invalid ? CONTROL_INVALID : CONTROL_DEFAULT),
      })}

      {hint && !error && (
        <p id={hintId} className="text-sm text-slate-600 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

type FieldBase = {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  className?: string
}

export function Field({
  label,
  hideLabel,
  hint,
  error,
  className,
  required,
  ...props
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ id, describedBy, invalid, controlClass }) => (
        <input
          id={id}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={controlClass}
          {...props}
        />
      )}
    </FieldShell>
  )
}

export function SelectField({
  label,
  hideLabel,
  hint,
  error,
  className,
  required,
  children,
  ...props
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ id, describedBy, invalid, controlClass }) => (
        <select
          id={id}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={controlClass}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
}

export function TextareaField({
  label,
  hideLabel,
  hint,
  error,
  className,
  required,
  ...props
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {({ id, describedBy, invalid, controlClass }) => (
        <textarea
          id={id}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={controlClass}
          {...props}
        />
      )}
    </FieldShell>
  )
}

export default Field
