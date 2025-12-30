import { useState } from 'react'
import { Plus, Trash2, Car } from 'lucide-react'
import { VehicleLookupModal } from '@/components/lookup/LookupModal'
import { VehicleSearchResult } from '@/services/vehicles'

export interface WeddingVehicleRow {
  id: string
  vehicleId: number | null
  vehicleInfo: string
  plateNumber: string
  startDate: string
  endDate: string
  dailyRate: number
  days: number
  total: number
}

interface WeddingVehicleTableProps {
  vehicles: WeddingVehicleRow[]
  onAddVehicle: (vehicle: WeddingVehicleRow) => void
  onRemoveVehicle: (id: string) => void
  onUpdateVehicle: (id: string, updates: Partial<WeddingVehicleRow>) => void
  eventDate: string
  eventEndDate: string
  readOnly?: boolean
}

export default function WeddingVehicleTable({
  vehicles,
  onAddVehicle,
  onRemoveVehicle,
  onUpdateVehicle,
  eventDate,
  eventEndDate,
  readOnly = false,
}: WeddingVehicleTableProps) {
  const [showVehicleLookup, setShowVehicleLookup] = useState(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)

  const handleSelectVehicle = (vehicle: VehicleSearchResult) => {
    if (editingRowId) {
      // Update existing row
      onUpdateVehicle(editingRowId, {
        vehicleId: vehicle.id,
        vehicleInfo: `${vehicle.make} ${vehicle.model} (${vehicle.year})`,
        plateNumber: vehicle.plate_number,
        dailyRate: vehicle.daily_rate,
      })
      setEditingRowId(null)
    } else {
      // Add new row
      const days = calculateDays(eventDate, eventEndDate)
      const newRow: WeddingVehicleRow = {
        id: `temp-${Date.now()}`,
        vehicleId: vehicle.id,
        vehicleInfo: `${vehicle.make} ${vehicle.model} (${vehicle.year})`,
        plateNumber: vehicle.plate_number,
        startDate: eventDate,
        endDate: eventEndDate,
        dailyRate: vehicle.daily_rate,
        days,
        total: vehicle.daily_rate * days,
      }
      onAddVehicle(newRow)
    }
  }

  const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 1
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(1, diffDays)
  }

  const handleDateChange = (id: string, field: 'startDate' | 'endDate', value: string) => {
    const row = vehicles.find(v => v.id === id)
    if (!row) return

    const newStart = field === 'startDate' ? value : row.startDate
    const newEnd = field === 'endDate' ? value : row.endDate
    const days = calculateDays(newStart, newEnd)
    
    onUpdateVehicle(id, {
      [field]: value,
      days,
      total: row.dailyRate * days,
    })
  }

  const handleRateChange = (id: string, rate: number) => {
    const row = vehicles.find(v => v.id === id)
    if (!row) return

    onUpdateVehicle(id, {
      dailyRate: rate,
      total: rate * row.days,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  const grandTotal = vehicles.reduce((sum, v) => sum + v.total, 0)

  return (
    <div className="rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Vehicle
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Start Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              End Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Days
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Daily Rate
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Total
            </th>
            {!readOnly && (
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {vehicles.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-4 py-3">
                {row.vehicleId ? (
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{row.vehicleInfo}</div>
                      <div className="text-xs text-gray-500">{row.plateNumber}</div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingRowId(row.id)
                      setShowVehicleLookup(true)
                    }}
                    disabled={readOnly}
                    className="text-sm text-pink-600 hover:underline disabled:opacity-50"
                  >
                    Select vehicle...
                  </button>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {readOnly ? (
                  <span className="text-sm">{row.startDate}</span>
                ) : (
                  <input
                    type="date"
                    value={row.startDate}
                    onChange={(e) => handleDateChange(row.id, 'startDate', e.target.value)}
                    className="rounded border px-2 py-1 text-sm"
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {readOnly ? (
                  <span className="text-sm">{row.endDate}</span>
                ) : (
                  <input
                    type="date"
                    value={row.endDate}
                    onChange={(e) => handleDateChange(row.id, 'endDate', e.target.value)}
                    className="rounded border px-2 py-1 text-sm"
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {row.days}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {readOnly ? (
                  <span className="text-sm">{formatCurrency(row.dailyRate)}</span>
                ) : (
                  <input
                    type="number"
                    value={row.dailyRate}
                    onChange={(e) => handleRateChange(row.id, parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    className="w-28 rounded border px-2 py-1 text-sm"
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                {formatCurrency(row.total)}
              </td>
              {!readOnly && (
                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <button
                    onClick={() => onRemoveVehicle(row.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {vehicles.length === 0 && (
            <tr>
              <td colSpan={readOnly ? 6 : 7} className="px-4 py-8 text-center text-gray-500">
                No vehicles added yet
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-gray-50">
          <tr>
            <td colSpan={readOnly ? 4 : 5} className="px-4 py-3">
              {!readOnly && (
                <button
                  onClick={() => {
                    setEditingRowId(null)
                    setShowVehicleLookup(true)
                  }}
                  className="flex items-center gap-2 text-sm text-pink-600 hover:text-pink-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Vehicle
                </button>
              )}
            </td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-700">
              Grand Total:
            </td>
            <td className="px-4 py-3 text-right text-lg font-bold text-pink-600">
              {formatCurrency(grandTotal)}
            </td>
            {!readOnly && <td />}
          </tr>
        </tfoot>
      </table>

      {/* Vehicle Lookup Modal */}
      <VehicleLookupModal
        isOpen={showVehicleLookup}
        onClose={() => {
          setShowVehicleLookup(false)
          setEditingRowId(null)
        }}
        onSelect={handleSelectVehicle}
        availableOnly={true}
      />
    </div>
  )
}
