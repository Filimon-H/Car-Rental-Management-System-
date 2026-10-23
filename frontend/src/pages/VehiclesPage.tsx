import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, Car } from 'lucide-react'
import { vehiclesService, VehicleStatus, Vehicle } from '@/services/vehicles'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar, FilterTabs } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/services/apiClient'

const PAGE_SIZE = 20

export default function VehiclesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('')
  const [deleteConfirm, setDeleteConfirm] = useState<Vehicle | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm)

  const statusTabs = [
    { value: '', label: t('vehicles.status.all', 'All') },
    { value: 'available', label: t('vehicles.status.available', 'Available') },
    { value: 'rented', label: t('vehicles.status.rented', 'Rented') },
    { value: 'maintenance', label: t('vehicles.status.maintenance', 'Maintenance') },
    { value: 'reserved', label: t('vehicles.status.reserved', 'Reserved') },
    // Stored as 'inactive' on the backend; shown as "Retired".
    { value: 'inactive', label: t('vehicles.status.retired', 'Retired') },
  ]

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', page, debouncedSearch, statusFilter],
    queryFn: () =>
      vehiclesService.list({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: vehiclesService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setDeleteConfirm(null)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: VehicleStatus }) =>
      vehiclesService.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
    onError: (error: unknown) => {
      // Without this a rejected change was silent: the select showed the new
      // value while the vehicle kept the old one. Refetching puts the control
      // back in step with the server.
      toast({
        description: getErrorMessage(error, t('vehicles.statusChangeFailed')),
        variant: 'destructive',
      })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const columns: Column<Vehicle>[] = [
    {
      key: 'vehicle',
      header: t('vehicles.columns.vehicle', 'Vehicle'),
      className: 'whitespace-nowrap',
      cell: (vehicle) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10">
            <Car className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {vehicle.make} {vehicle.model}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{vehicle.plate_number}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: t('vehicles.columns.details', 'Details'),
      className: 'whitespace-nowrap',
      cell: (vehicle) => (
        <>
          <div>
            {vehicle.year} ·{' '}
            {t(`vehicleValues.colors.${vehicle.color.toLowerCase()}`, {
              defaultValue: vehicle.color,
            })}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {t(`vehicleValues.types.${vehicle.vehicle_type.toLowerCase()}`, {
              defaultValue: vehicle.vehicle_type,
            })}{' '}
            · {t('vehicles.seats', '{{count}} seats', { count: vehicle.seats })}
          </div>
        </>
      ),
    },
    {
      key: 'rate',
      header: t('vehicles.columns.dailyRate', 'Daily Rate'),
      className: 'whitespace-nowrap font-semibold text-slate-800 dark:text-slate-100',
      cell: (vehicle) => formatCurrency(vehicle.daily_rate),
    },
    {
      key: 'status',
      header: t('vehicles.columns.status', 'Status'),
      className: 'whitespace-nowrap',
      cell: (vehicle) => (
        // Stops the row's navigate from firing when the select is used.
        <div onClick={(e) => e.stopPropagation()}>
          {vehicle.status === 'rented' ? (
            <StatusBadge status={vehicle.status} />
          ) : (
            <>
              <label htmlFor={`vehicle-status-${vehicle.id}`} className="sr-only">
                {t('vehicles.changeStatus', 'Change status for {{plate}}', {
                  plate: vehicle.plate_number,
                })}
              </label>
              <select
                id={`vehicle-status-${vehicle.id}`}
                value={vehicle.status}
                onChange={(e) =>
                  statusMutation.mutate({
                    id: vehicle.id,
                    status: e.target.value as VehicleStatus,
                  })
                }
                className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-night-border dark:bg-night-raised dark:text-slate-200"
              >
                <option value="available">{t('vehicles.status.available', 'Available')}</option>
                <option value="rented">{t('vehicles.status.rented', 'Rented')}</option>
                <option value="maintenance">
                  {t('vehicles.status.maintenance', 'Maintenance')}
                </option>
                <option value="reserved">{t('vehicles.status.reserved', 'Reserved')}</option>
                <option value="inactive">{t('vehicles.status.retired', 'Retired')}</option>
              </select>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (vehicle) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/vehicles/${vehicle.id}/edit`)
            }}
            aria-label={t('vehicles.editAria', 'Edit {{plate}}', { plate: vehicle.plate_number })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteConfirm(vehicle)
            }}
            disabled={vehicle.status === 'rented'}
            aria-label={t('vehicles.deleteAria', 'Delete {{plate}}', {
              plate: vehicle.plate_number,
            })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 page-fade">
      <PageToolbar
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/vehicles/new')}>
            {t('vehicles.add', 'Add Vehicle')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('vehicles.searchLabel', 'Search vehicles')}
          placeholder={t('vehicles.searchPlaceholder', 'Search by plate, make, model...')}
          className="w-full sm:w-72"
        />
      </PageToolbar>

      <div className="mb-4">
        <FilterTabs
          tabs={statusTabs}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as VehicleStatus | '')}
          label={t('vehicles.filterByStatus', 'Filter by status')}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(vehicle) => vehicle.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(vehicle) => navigate(`/vehicles/${vehicle.id}`)}
        caption={t('vehicles.title', 'Vehicles')}
        emptyTitle={t('vehicles.empty', 'No vehicles found')}
        emptyMessage={
          debouncedSearch || statusFilter
            ? t('vehicles.emptyFiltered', 'Try a different search term or status filter.')
            : t('vehicles.emptyInitial', 'Add your first vehicle to get started.')
        }
        errorMessage={t('vehicles.loadError', 'Error loading vehicles')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('vehicles.pagination', 'Vehicles pagination')}
        />
      )}

      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-vehicle-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 dark:bg-night-surface dark:ring-night-border">
            <h3
              id="delete-vehicle-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {t('vehicles.deleteTitle', 'Delete Vehicle')}
            </h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t('vehicles.deleteConfirm', 'Are you sure you want to delete')}{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {deleteConfirm.make} {deleteConfirm.model} ({deleteConfirm.plate_number})
              </strong>
              ? {t('common.cannotBeUndone', 'This action cannot be undone.')}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t('common.deleting', 'Deleting...')
                  : t('common.delete', 'Delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
