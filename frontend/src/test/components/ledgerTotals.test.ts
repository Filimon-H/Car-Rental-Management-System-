import { describe, it, expect } from 'vitest'
import { toNumber } from '@/lib/utils'

/**
 * Mirrors the computation in LedgerTable for agreement 20, which rendered
 * "ETB NaN" and counted the held deposit as money paid.
 */
const DEPOSIT_TYPES = ['deposit', 'deposit_return']
const affectsBalance = (t: string) => !DEPOSIT_TYPES.includes(t)

type Row = { id?: number; entry_type: string; amount: string | number; reversed_entry_id?: number | null }
const wasReversed = (e: Row, all: Row[]) =>
  e.id !== undefined && all.some((o) => o.reversed_entry_id === e.id)
const stillStands = (e: Row, all: Row[]) => !wasReversed(e, all) && e.entry_type !== 'reversal'

// Exactly what GET /agreements/20/ledger returns — Decimal strings.
const entries = [
  { entry_type: 'charge', amount: '13500.00' },
  { entry_type: 'deposit', amount: '-5000.00' },
]

function compute(rows: Row[]) {
  let running = 0
  const balances = rows.map((e) => {
    if (affectsBalance(e.entry_type)) running += toNumber(e.amount)
    return running
  })
  return {
    balances,
    totalCharged: rows
      .filter((e) => stillStands(e, rows) && toNumber(e.amount) > 0)
      .reduce((s, e) => s + toNumber(e.amount), 0),
    totalPaid: rows
      .filter((e) => e.entry_type === 'payment' && stillStands(e, rows))
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

describe('reversed entries', () => {
  // Agreement 20 exactly as QA left it.
  const agreement20: Row[] = [
    { id: 33, entry_type: 'charge', amount: '13500.00' },
    { id: 37, entry_type: 'deposit', amount: '-5000.00' },
    { id: 38, entry_type: 'payment', amount: '-3000.00' },
    { id: 39, entry_type: 'adjustment', amount: '-500.00' },
    { id: 40, entry_type: 'adjustment', amount: '200.00' },
    { id: 41, entry_type: 'adjustment', amount: '-300.00' },
    { id: 42, entry_type: 'damage_charge', amount: '800.00' },
    { id: 43, entry_type: 'late_fee', amount: '250.00' },
    { id: 44, entry_type: 'reversal', amount: '3000.00', reversed_entry_id: 38 },
  ]

  it('does not count a reversed payment as collected', () => {
    expect(compute(agreement20).totalPaid).toBe(0)
  })

  it('does not count the reversal row as a charge', () => {
    // 13500 + 200 + 800 + 250 = 14750 gross debits that still stand.
    expect(compute(agreement20).totalCharged).toBe(14750)
  })

  it('keeps the running balance at the settled figure', () => {
    // The signed sum still nets: the reversal cancels the payment.
    expect(compute(agreement20).balance).toBe(13950)
  })

  it('counts a payment that was never reversed', () => {
    const rows = agreement20.filter((e) => e.id !== 44)
    expect(compute(rows).totalPaid).toBe(3000)
  })
})
