import { describe, it, expect } from 'vitest'
import type { VehicleStatus } from '@/services/vehicles'

/**
 * The UI once offered a "retired" status the backend enum never had, so the
 * PATCH failed with 422 and a genuinely inactive vehicle fell back to showing
 * the first option ("Available"). These lists must stay in step.
 */
const BACKEND_ENUM = ['available', 'reserved', 'rented', 'maintenance', 'inactive'] as const

// Every value the vehicles list can submit or render.
const UI_VALUES: VehicleStatus[] = [
  'available',
  'rented',
  'reserved',
  'maintenance',
  'inactive',
]

describe('vehicle status values', () => {
  it('never offers a value the backend enum rejects', () => {
    const unknown = UI_VALUES.filter((v) => !BACKEND_ENUM.includes(v as never))
    expect(unknown).toEqual([])
  })

  it('has an option for every value the backend can store', () => {
    // A stored status with no matching <option> makes a controlled select
    // display the wrong value — how an inactive vehicle read as "Available".
    const unrepresented = BACKEND_ENUM.filter((v) => !UI_VALUES.includes(v))
    expect(unrepresented).toEqual([])
  })

  it('uses "inactive", not "retired", as the stored value', () => {
    expect(UI_VALUES).toContain('inactive')
    expect(UI_VALUES).not.toContain('retired' as VehicleStatus)
  })
})
