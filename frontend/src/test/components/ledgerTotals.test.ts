import { describe, it, expect } from 'vitest'
import { toNumber } from '@/lib/utils'

/**
 * Mirrors the computation in LedgerTable for agreement 20, which rendered
 * "ETB NaN" and counted the held deposit as money paid.
 */
const DEPOSIT_TYPES = ['deposit', 'deposit_return']
const affectsBalance = (t: string) => !DEPOSIT_TYPES.includes(t)

// Exactly what GET /agreements/20/ledger returns — Decimal strings.
const entries = [
  { entry_type: 'charge', amount: '13500.00' },
  { entry_type: 'deposit', amount: '-5000.00' },
]

function compute(rows: { entry_type: string; amount: string | number }[]) {
  let running = 0
  const balances = rows.map((e) => {
    if (affectsBalance(e.entry_type)) running += toNumber(e.amount)
    return running
  })
  return {
    balances,
    totalCharged: rows
      .filter((e) => toNumber(e.amount) > 0)
      .reduce((s, e) => s + toNumber(e.amount), 0),
    totalPaid: rows
      .filter((e) => e.entry_type === 'payment')
      .reduce((s, e) => s + Math.abs(toNumber(e.amount)), 0),
    depositHeld: rows
      .filter((e) => DEPOSIT_TYPES.includes(e.entry_type))
      .reduce((s, e) => s + Math.abs(toNumber(e.amount)) * (e.entry_type === 'deposit' ? 1 : -1), 0),
    balance: running,
  }
}

describe('ledger totals', () => {
  it('produces no NaN from Decimal strings', () => {
    const r = compute(entries)
    for (const v of [...r.balances, r.totalCharged, r.totalPaid, r.depositHeld, r.balance]) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('matches the API balance breakdown for agreement 20', () => {
    const r = compute(entries)
    expect(r.totalCharged).toBe(13500)
    expect(r.totalPaid).toBe(0) // a deposit is not a payment
    expect(r.depositHeld).toBe(5000)
    expect(r.balance).toBe(13500) // deposit does not reduce the balance until applied
  })

  it('leaves the running balance unchanged by a received deposit', () => {
    expect(compute(entries).balances).toEqual([13500, 13500])
  })

  it('counts a real payment against the balance', () => {
    const r = compute([...entries, { entry_type: 'payment', amount: '-3000.00' }])
    expect(r.totalPaid).toBe(3000)
    expect(r.balance).toBe(10500)
  })

  it('reduces the balance once the deposit is applied', () => {
    const r = compute([...entries, { entry_type: 'deposit_applied', amount: '-5000.00' }])
    expect(r.balance).toBe(8500)
    expect(r.totalPaid).toBe(0)
  })

  it('drops held deposit when it is returned', () => {
    const r = compute([...entries, { entry_type: 'deposit_return', amount: '5000.00' }])
    expect(r.depositHeld).toBe(0)
    expect(r.balance).toBe(13500)
  })
})
