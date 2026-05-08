import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit, Trash2, Car } from 'lucide-react'
import { vehiclesService, VehicleStatus } from '@/services/vehicles'

const STATUS_TABS: { value: VehicleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'rented', label: 'Rented' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'retired', label: 'Retired' },
]

const statusMap: Record<VehicleStatus, { dot: string; text: string; bg: string }> = {
  available: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  rented: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  maintenance: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  reserved: { dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  retired: { dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-100' },
}

function StatusBadge({ status }: { status: VehicleStatus }) {
  const s = statusMap[status] || statusMap.available
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function VehiclesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', page, searchTerm, statusFilter],
    queryFn: () =>
      vehiclesService.list({
        page,
        page_size: 20,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: vehiclesService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: VehicleStatus }) =>
      vehiclesService.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this vehicle?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleStatusChange = (id: number, status: VehicleStatus) => {
    statusMutation.mutate({ id, status })
  }

  const handleTabChange = (value: VehicleStatus | '') => {
    setStatusFilter(value)
    setPage(1)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  return (
    <div className="p-6 page-fade">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by plate, make, model..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => navigate('/vehicles/new')}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {t('vehicles.add', 'Add Vehicle')}
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === tab.value
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary" />
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Vehicle
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Details
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Daily Rate
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                >
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <Car className="h-4 w-4 text-slate-400" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {vehicle.make} {vehicle.model}
                        </div>
                        <div className="text-xs text-slate-400">{vehicle.plate_number}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">
                    <div>
                      {vehicle.year} · {vehicle.color}
                    </div>
                    <div className="text-xs text-slate-400">
                      {vehicle.vehicle_type} · {vehicle.seats} seats
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm font-semibold text-slate-800">
                    {formatCurrency(vehicle.daily_rate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    {vehicle.status === 'rented' ? (
                      <StatusBadge status={vehicle.status} />
                    ) : (
                      <select
                        value={vehicle.status}
                        onChange={(e) =>
                          handleStatusChange(vehicle.id, e.target.value as VehicleStatus)
                        }
                        className={`cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-6 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                          statusMap[vehicle.status]?.bg
                        } ${statusMap[vehicle.status]?.text}`}
                      >
                        <option value="available">Available</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="reserved">Reserved</option>
                        <option value="retired">Retired</option>
                      </select>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/vehicles/${vehicle.id}/edit`)
                        }}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(vehicle.id)
                        }}
                        disabled={vehicle.status === 'rented'}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-400">
                    No vehicles found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
            <p className="text-xs text-slate-400">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of{' '}
              <span className="font-medium text-slate-600">{data.total}</span>
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 20 >= data.total}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
