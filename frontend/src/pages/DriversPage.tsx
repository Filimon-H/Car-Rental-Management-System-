import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2, User } from 'lucide-react'
import { driversService, Driver, CreateDriverData } from '@/services/drivers'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const PAGE_SIZE = 20

export default function DriversPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Driver | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['drivers', page, debouncedSearch],
    queryFn: () => driversService.list({ page, search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: driversService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      setDeleteConfirm(null)
    },
  })

  const handleEdit = (driver: Driver) => {
    setEditingDriver(driver)
    setShowModal(true)
  }

  const driverName = (driver: Driver) => `${driver.first_name} ${driver.last_name}`

  const columns: Column<Driver>[] = [
    {
      key: 'driver',
      header: t('drivers.columns.driver', 'Driver'),
      cell: (driver) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-white/10">
            <User className="h-5 w-5 text-primary dark:text-orange-brand" aria-hidden="true" />
          </div>
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {driverName(driver)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {driver.email || t('drivers.noEmail', 'No email')}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('drivers.columns.phone', 'Phone'),
      className: 'whitespace-nowrap',
      cell: (driver) => driver.phone_primary,
    },
    {
      key: 'license',
      header: t('drivers.columns.license', 'License'),
      className: 'whitespace-nowrap',
      cell: (driver) => driver.license_number,
    },
    {
      key: 'expiry',
      header: t('drivers.columns.licenseExpiry', 'License Expiry'),
      className: 'whitespace-nowrap',
      cell: (driver) =>
        driver.license_expiry
          ? new Date(driver.license_expiry).toLocaleDateString()
          : t('common.notAvailable', 'N/A'),
    },
    {
      key: 'status',
      header: t('drivers.columns.status', 'Status'),
      cell: (driver) => (
        <StatusBadge
          status={driver.is_active ? 'active' : 'inactive'}
          label={driver.is_active ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (driver) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleEdit(driver)}
            aria-label={t('drivers.editAria', 'Edit {{name}}', { name: driverName(driver) })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirm(driver)}
            aria-label={t('drivers.deleteAria', 'Delete {{name}}', { name: driverName(driver) })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <PageToolbar
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingDriver(null)
              setShowModal(true)
            }}
          >
            {t('drivers.add', 'Add Driver')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('drivers.searchLabel', 'Search drivers')}
          placeholder={t('drivers.searchPlaceholder', 'Search drivers...')}
          className="w-full sm:w-72"
        />
      </PageToolbar>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(driver) => driver.id}
        isLoading={isLoading}
        error={error}
        caption={t('drivers.title', 'Drivers')}
        emptyTitle={t('drivers.empty', 'No drivers found')}
        emptyMessage={
          debouncedSearch
            ? t('drivers.emptyFiltered', 'Try a different search term.')
            : t('drivers.emptyInitial', 'Add your first driver to get started.')
        }
        errorMessage={t('drivers.loadError', 'Error loading drivers')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('drivers.pagination', 'Drivers pagination')}
        />
      )}

      {showModal && (
        <DriverModal
          driver={editingDriver}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries({ queryKey: ['drivers'] })
          }}
        />
      )}

      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-driver-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 dark:bg-night-surface dark:ring-night-border">
            <h3
              id="delete-driver-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {t('drivers.deleteTitle', 'Delete Driver')}
            </h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t('drivers.deleteConfirm', 'Are you sure you want to delete')}{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {driverName(deleteConfirm)}
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

function DriverModal({ driver, onClose, onSuccess }: { driver: Driver | null; onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<CreateDriverData>({
    first_name: driver?.first_name || '',
    last_name: driver?.last_name || '',
    phone_primary: driver?.phone_primary || '',
    phone_secondary: driver?.phone_secondary || '',
    email: driver?.email || '',
    id_type: driver?.id_type || 'national_id',
    id_number: driver?.id_number || '',
    license_number: driver?.license_number || '',
    license_expiry: driver?.license_expiry ? driver.license_expiry.split('T')[0] : '',
    license_class: driver?.license_class || '',
    house_number: driver?.house_number || '',
    wereda: driver?.wereda || '',
    subcity: driver?.subcity || '',
    city: driver?.city || '',
    emergency_contact_name: driver?.emergency_contact_name || '',
    emergency_contact_phone: driver?.emergency_contact_phone || '',
    notes: driver?.notes || '',
  })

  const createMutation = useMutation({ mutationFn: driversService.create, onSuccess })
  const updateMutation = useMutation({ mutationFn: (data: CreateDriverData) => driversService.update(driver!.id, data), onSuccess })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = {
      ...formData,
      license_expiry: formData.license_expiry ? formData.license_expiry + 'T00:00:00' : undefined,
    }
    if (driver) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{driver ? 'Edit Driver' : 'Add Driver'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">First Name *</label>
              <input type="text" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Last Name *</label>
              <input type="text" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Primary Phone *</label>
              <input type="tel" value={formData.phone_primary} onChange={e => setFormData({...formData, phone_primary: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('customerCreate.secondaryPhone')}</label>
              <input type="tel" value={formData.phone_secondary} onChange={e => setFormData({...formData, phone_secondary: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('customerCreate.email')}</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">License Number *</label>
              <input type="text" value={formData.license_number} onChange={e => setFormData({...formData, license_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('drivers.columns.licenseExpiry')}</label>
              <input type="date" value={formData.license_expiry} onChange={e => setFormData({...formData, license_expiry: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('driver.licenseClass')}</label>
              <input type="text" value={formData.license_class} onChange={e => setFormData({...formData, license_class: e.target.value})} className="w-full rounded-lg border px-3 py-2" placeholder="e.g. Class 3" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('agreementCreate.idType')}</label>
              <select value={formData.id_type} onChange={e => setFormData({...formData, id_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                <option value="national_id">{t('customerCreate.nationalId')}</option>
                <option value="passport">{t('customerCreate.passport')}</option>
                <option value="kebele_id">{t('customerCreate.kebeleId')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('agreementCreate.idNumber')}</label>
            <input type="text" value={formData.id_number} onChange={e => setFormData({...formData, id_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('customerCreate.houseNumber')}</label>
              <input type="text" value={formData.house_number} onChange={e => setFormData({...formData, house_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('customerCreate.wereda')}</label>
              <input type="text" value={formData.wereda} onChange={e => setFormData({...formData, wereda: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('customerCreate.subcity')}</label>
              <select value={formData.subcity} onChange={e => setFormData({...formData, subcity: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                <option value="">{t('customerCreate.selectSubcity')}</option>
                <option value="Bole">{t('subcity.bole')}</option>
                <option value="Lideta">{t('subcity.lideta')}</option>
                <option value="Yeka">{t('subcity.yeka')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('agreementCreate.city')}</label>
              <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('sections.emergencyContactName')}</label>
              <input type="text" value={formData.emergency_contact_name} onChange={e => setFormData({...formData, emergency_contact_name: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('sections.emergencyContactPhone')}</label>
              <input type="tel" value={formData.emergency_contact_phone} onChange={e => setFormData({...formData, emergency_contact_phone: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('agreementCreate.notes')}</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">{t('common.cancel')}</button>
            <button type="submit" disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50">
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
