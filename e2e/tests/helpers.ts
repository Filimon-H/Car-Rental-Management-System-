import { PORTS } from '../playwright.config'

export const LANDING = `http://localhost:${PORTS.landing}`
export const ADMIN_APP = `http://localhost:${PORTS.admin}`
export const API = `http://127.0.0.1:${PORTS.api}`

/** A local calendar date `days` from today, as a date input wants it. */
export function dayFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The cars scripts/seed.py creates. */
export const SEEDED = {
  // Free all the time; 1,100/day, 6,500 for a week.
  free: '2024 Toyota Yaris',
  // Held by a pending-payment booking from day 30 to day 37.
  held: '2024 Toyota Corolla',
}
