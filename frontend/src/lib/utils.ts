import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Coerce an API money field to a number.
 *
 * The backend types these as Decimal, which serialises to a JSON string even
 * where the TS interface declares `number`. Adding them directly concatenates
 * ("0" + "100000") and surfaces as "ETBNaN" in totals. Non-numeric input
 * yields 0 so a bad field cannot poison a whole column.
 */
export function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? 0))
  return Number.isFinite(n) ? n : 0
}
