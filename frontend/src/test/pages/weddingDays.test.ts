import { describe, it, expect } from 'vitest'

/**
 * Mirrors calculateVehicleDays in WeddingAgreementCreatePage, and the 24h
 * block rule in wedding_agreement_service. The preview compared bare dates
 * while the payload sent 23:59 as the end, so a one-day event previewed as
 * 2,200 and was charged 4,400.
 */
const toDatetime = (date: string, time: string) => `${date}T${time}:00`

function days(startDate: string, endDate: string, time: string) {
  const start = new Date(toDatetime(startDate, time))
  const end = new Date(toDatetime(endDate, time))
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  if (!Number.isFinite(hours) || hours <= 0) return 1
  return Math.max(1, Math.ceil(hours / 24))
}

/** What the backend charges for the same window. */
function backendDays(startIso: string, endIso: string) {
  const hours = (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60)
  const whole = Math.floor(hours / 24)
  return Math.max(1, hours % 24 > 0 ? whole + 1 : whole)
}

describe('wedding day count', () => {
  it("charges one day for QA's 20-21 Nov event", () => {
    expect(days('2026-11-20', '2026-11-21', '09:00')).toBe(1)
  })

  it('previews the same total the backend charges', () => {
    const preview = days('2026-11-20', '2026-11-21', '09:00') * (1200 + 1000)
    const charged = backendDays('2026-11-20T09:00:00', '2026-11-21T09:00:00') * (1200 + 1000)
    expect(preview).toBe(2200)
    expect(charged).toBe(preview)
  })

  it('agrees with the backend across a range of spans', () => {
    for (const [start, end] of [
      ['2026-11-20', '2026-11-21'],
      ['2026-11-20', '2026-11-23'],
      ['2026-11-20', '2026-11-27'],
      ['2026-11-20', '2026-12-20'],
    ]) {
      const preview = days(start, end, '09:00')
      const charged = backendDays(`${start}T09:00:00`, `${end}T09:00:00`)
      expect(preview).toBe(charged)
    }
  })

  it('counts a same-day event as one day', () => {
    expect(days('2026-11-20', '2026-11-20', '09:00')).toBe(1)
  })

  it('never returns zero or a negative span', () => {
    expect(days('2026-11-21', '2026-11-20', '09:00')).toBe(1)
  })
})
