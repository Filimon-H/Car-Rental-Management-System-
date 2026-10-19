/**
 * The vehicle page's service history.
 *
 * The backend recorded maintenance and computed what was due, but the admin
 * app never called it, so there was nowhere to log an oil change or see that
 * a car was past its service.
 *
 * i18n is loaded explicitly so strings render in English rather than as keys.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { MaintenanceSection } from '@/components/vehicles/MaintenanceSection'
import { useAuthStore } from '@/services/auth'
import { maintenanceService } from '@/services/maintenance'

const RECORD = {
  id: 7,
  vehicle_id: 10,
  service_type: 'oil_change' as const,
  performed_at: '2026-09-01T09:00:00Z',
  description: 'Oil and filter',
  odometer: 41000,
  cost: '1800.00',
  provider: 'Bole Garage',
  notes: null,
  next_due_date: '2026-12-01T00:00:00Z',
  next_due_mileage: 46000,
  created_at: '2026-09-01T09:00:00Z',
}

function renderSection(role: string) {
  useAuthStore.setState({
    user: { id: 1, username: 'u', full_name: 'U', email: 'u@x', role, is_active: true },
    isAuthenticated: true,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceSection vehicleId={10} currentMileage={42000} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('history', () => {
  it('lists recorded service', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([RECORD])
    renderSection('admin')

    expect(await screen.findByText('Oil and filter')).toBeInTheDocument()
    expect(screen.getByText('Bole Garage')).toBeInTheDocument()
    expect(screen.getByText('41,000 km')).toBeInTheDocument()
  })

  it('says so when there is none', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([])
    renderSection('admin')

    expect(await screen.findByText('No service recorded for this vehicle yet.')).toBeInTheDocument()
  })
})

describe('who can change it', () => {
  it('offers logging and deleting to fleet staff', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([RECORD])
    renderSection('fleet')

    await screen.findByText('Oil and filter')
    expect(screen.getByRole('button', { name: 'Log service' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete service record from/ })).toBeInTheDocument()
  })

  it('does not offer them to a role the server will refuse', async () => {
    // MANAGE_VEHICLES is admin and fleet only.
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([RECORD])
    renderSection('sales')

    await screen.findByText('Oil and filter')
    expect(screen.queryByRole('button', { name: 'Log service' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete service record from/ })).toBeNull()
  })
})

describe('logging a service', () => {
  it('sends the record with instants, not wall-clock dates', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([])
    const create = vi.spyOn(maintenanceService, 'create').mockResolvedValue(RECORD)
    renderSection('admin')

    fireEvent.click(await screen.findByRole('button', { name: 'Log service' }))
    fireEvent.change(screen.getByLabelText(/^Work done/), {
      target: { value: 'Brake pads' },
    })
    fireEvent.change(screen.getByLabelText(/^Cost \(ETB\)/), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    const [vehicleId, payload] = create.mock.calls[0]
    expect(vehicleId).toBe(10)
    expect(payload.description).toBe('Brake pads')
    expect(payload.cost).toBe(2500)
    // Pre-filled from the vehicle so staff do not retype it.
    expect(payload.odometer).toBe(42000)
    // A true instant: these columns are UtcDateTime.
    expect(payload.performed_at).toMatch(/Z$/)
  })

  it('refuses a missing description without calling the server', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([])
    const create = vi.spyOn(maintenanceService, 'create')
    renderSection('admin')

    fireEvent.click(await screen.findByRole('button', { name: 'Log service' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))

    // The browser's own required-field check stops the submit first; the
    // component's check is the fallback. Either way nothing is sent.
    expect(screen.getByLabelText(/^Work done/)).toBeInvalid()
    await new Promise((r) => setTimeout(r, 50))
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a next service that is not after this one', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([])
    const create = vi.spyOn(maintenanceService, 'create')
    renderSection('admin')

    fireEvent.click(await screen.findByRole('button', { name: 'Log service' }))
    fireEvent.change(screen.getByLabelText(/^Work done/), {
      target: { value: 'Service' },
    })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-10' } })
    fireEvent.change(screen.getByLabelText(/^Next service date/), {
      target: { value: '2026-09-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))

    // min= on the next-due input refuses it natively.
    expect(screen.getByLabelText(/^Next service date/)).toBeInvalid()
    await new Promise((r) => setTimeout(r, 50))
    expect(create).not.toHaveBeenCalled()
  })
})

describe('deleting', () => {
  it('asks first, then removes the record', async () => {
    vi.spyOn(maintenanceService, 'listForVehicle').mockResolvedValue([RECORD])
    const remove = vi.spyOn(maintenanceService, 'remove').mockResolvedValue(undefined)
    renderSection('admin')

    fireEvent.click(await screen.findByRole('button', { name: /Delete service record from/ }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith(7))
  })
})
