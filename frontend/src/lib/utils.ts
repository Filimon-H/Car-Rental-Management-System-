import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '../i18n'

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

/** Normalize Ethiopian mobile numbers for display and API payloads. */
export function normalizeEthiopianPhone(phone: string): string {
  if (!phone) return phone
  const cleaned = phone.replace(/[\s()-]/g, '')
  if (/^09\d{8}$/.test(cleaned)) return `+251${cleaned.slice(1)}`
  if (/^9\d{8}$/.test(cleaned)) return `+251${cleaned}`
  if (/^2519\d{8}$/.test(cleaned)) return `+${cleaned}`
  return cleaned
}

/** Format a Date for a datetime-local input without changing its wall-clock time. */
export function toDatetimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Convert a datetime-local value to the API's naive wall-clock representation. */
export function datetimeLocalToWallClockIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value
  return value.length === 16 ? `${value}:00` : value
}

/** Represent the current local clock time for APIs that store local business time. */
export function localNowWallClockIso(): string {
  return datetimeLocalToWallClockIso(toDatetimeLocalValue(new Date()))
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

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * The locale to format dates in, following the active UI language.
 *
 * Every call site passed a hardcoded 'en-US', so switching the interface to
 * አማርኛ still rendered "Oct 5, 2026" in the agreement header and the
 * agreements table. Reading i18next's current language keeps them in step.
 *
 * Amharic is mapped to am-ET so month names and numerals come out in
 * Ethiopic rather than falling back to the browser's default region.
 */
export function activeDateLocale(): string {
  const lang = i18n.resolvedLanguage || i18n.language || 'en'
  return lang.startsWith('am') ? 'am-ET' : 'en-GB'
}

/** A date in the active language: "5 Oct 2026" / "05 ጥቅም 2026". */
export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(activeDateLocale(), options)
}

/** A date and time in the active language. */
export function formatDateTime(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(activeDateLocale(), options)
}
