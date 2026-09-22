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

/**
 * Read an optional numeric form input.
 *
 * A cleared number input yields '', and Number.parseFloat('') is NaN, which
 * serialises to null in JSON but fails a backend `ge=0` check on the way
 * through. An empty field means "not set", so return null explicitly.
 */
export function parseOptionalNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Drop blank optional fields from a request payload.
 *
 * Forms hold every optional input as '' rather than undefined, and the API
 * validates by type — an empty string is not a valid EmailStr, so leaving an
 * optional Email box blank came back 422. Omitting the key lets the server
 * apply its own default or leave the column null.
 *
 * Tests `!== ''` rather than falsiness on purpose: 0 and false are real
 * values that must still be sent.
 */
export function stripBlanks<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  ) as Partial<T>
}
