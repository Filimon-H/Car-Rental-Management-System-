import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Edit,
  Trash2,
  Phone,
  Mail,
  UserPlus,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Globe,
} from 'lucide-react'
import { customersService, Customer, CreateCustomerData } from '@/services/customers'
import { BulkUploadModal } from '@/components/customers/BulkUploadModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar, FilterTabs } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/apiClient'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterOnline, setFilterOnline] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filterOnline])

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', page, debouncedSearch, filterOnline],
    queryFn: () =>
      customersService.list({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        // Filtered server-side so the list and its count cover every customer,
        // not just the ones on the current page.
        is_online_registered: filterOnline ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: customersService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id)
      setDeleteConfirm(null)
    }
  }

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: t('customers.columns.name', 'Name'),
      className: 'whitespace-nowrap',
      cell: (customer) => (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {customer.full_name}
            </span>
            {customer.is_online_registered && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30">
                <Globe className="h-3 w-3" aria-hidden="true" />
                {t('customers.online', 'Online')}
              </span>
            )}
          </div>
          {customer.city && (
            <div className="text-xs text-slate-400 dark:text-slate-500">{customer.city}</div>
          )}
        </>
      ),
    },
    {
      key: 'contact',
      header: t('customers.columns.contact', 'Contact'),
      className: 'whitespace-nowrap',
      cell: (customer) => (
        <>
          <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {customer.phone_primary}
          </div>
          {customer.email && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {customer.email}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'id',
      header: t('customers.columns.id', 'ID'),
      className: 'whitespace-nowrap',
      cell: (customer) => `${customer.id_type || '—'}: ${customer.id_number || '—'}`,
    },
    {
      key: 'status',
      header: t('customers.columns.status', 'Status'),
      cell: (customer) => (
        <StatusBadge
          status={customer.is_active ? 'active' : 'inactive'}
          label={
            customer.is_active ? t('common.active', 'Active') : t('common.inactive', 'Inactive')
          }
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (customer) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/customers/${customer.id}/edit`)
            }}
            aria-label={t('customers.editAria', 'Edit {{name}}', { name: customer.full_name })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteConfirm(customer)
            }}
            aria-label={t('customers.deleteAria', 'Delete {{name}}', { name: customer.full_name })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]

  const filterTabs = [
    { value: 'all', label: t('customers.tabs.all', 'All Customers') },
    { value: 'online', label: t('customers.tabs.online', 'Online Registered') },
  ]

  return (
    <div className="p-6 page-fade">
      <PageToolbar
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => setShowBulkUpload(true)}
            >
              {t('customers.bulkUpload', 'Bulk Upload')}
            </Button>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingCustomer(null)
                setShowModal(true)
              }}
            >
              {t('customers.quickAdd', 'Quick Add')}
            </Button>
            <Button
              icon={<UserPlus className="h-4 w-4" />}
              onClick={() => navigate('/customers/new')}
            >
              {t('customers.createNew', 'New Customer')}
            </Button>
          </>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('customers.searchLabel', 'Search customers')}
          placeholder={t('customers.searchPlaceholder', 'Search by name, phone, or ID...')}
          className="w-full sm:w-72"
        />
      </PageToolbar>

      <div className="mb-4">
        <FilterTabs
          tabs={filterTabs}
          value={filterOnline ? 'online' : 'all'}
          onChange={(value) => setFilterOnline(value === 'online')}
          label={t('customers.filterLabel', 'Filter customers')}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(customer) => customer.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
        caption={t('customers.title', 'Customers')}
        emptyTitle={
          filterOnline
            ? t('customers.emptyOnline', 'No online-registered customers found')
            : t('customers.empty', 'No customers found')
        }
        emptyMessage={
          debouncedSearch
            ? t('customers.emptyFiltered', 'Try a different search term.')
            : t('customers.emptyInitial', 'Add your first customer to get started.')
        }
        errorMessage={t('customers.loadError', 'Error loading customers')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('customers.pagination', 'Customers pagination')}
        />
      )}

      {/* Quick add / edit modal */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}

      {/* Bulk upload modal */}
      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-customer-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 dark:bg-night-surface dark:ring-night-border">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/15">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3
                  id="delete-customer-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t('customers.deleteTitle', 'Delete Customer')}
                </h3>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {t('customers.deleteConfirm', 'Are you sure you want to permanently delete')}{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {deleteConfirm.full_name}
                  </strong>
                  ? {t('common.cannotBeUndone', 'This action cannot be undone.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                aria-label={t('common.close', 'Close')}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
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

function CustomerModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer: Customer | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState<CreateCustomerData>({
    business_type: customer?.business_type || 'individual',
    company_name: customer?.company_name || '',
    tin_number: customer?.tin_number || '',
    first_name: customer?.first_name || '',
    last_name: customer?.last_name || '',
    phone_primary: customer?.phone_primary || '',
    phone_secondary: customer?.phone_secondary || '',
    email: customer?.email || '',
    id_type: customer?.id_type || 'passport',
    id_number: customer?.id_number || '',
    driver_license_number: customer?.driver_license_number || '',
    house_number: customer?.house_number || '',
    wereda: customer?.wereda || '',
    subcity: customer?.subcity || '',
    city: customer?.city || '',
    notes: customer?.notes || '',
  })

  const isNotIndividual = formData.business_type !== 'individual'

  const createMutation = useMutation({
    mutationFn: customersService.create,
    onSuccess,
    onError: (error: unknown) => {
      alert(getErrorMessage(error, 'Failed to create customer'))
    },
  })
  const updateMutation = useMutation({
    mutationFn: (data: CreateCustomerData) => customersService.update(customer!.id, data),
    onSuccess,
    onError: (error: unknown) => {
      alert(getErrorMessage(error, 'Failed to update customer'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customer) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20'
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {customer ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Business Type *</label>
            <select
              value={formData.business_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  business_type: e.target.value,
                  company_name: e.target.value === 'individual' ? '' : formData.company_name,
                })
              }
              className={inputClass}
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="government">Government</option>
              <option value="embassy">Embassy</option>
              <option value="ngo">NGO</option>
              <option value="church">Church</option>
            </select>
          </div>

          {isNotIndividual && (
            <div>
              <label className={labelClass}>Company/Organization Name *</label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass}>TIN Number</label>
            <input
              type="text"
              value={formData.tin_number}
              onChange={(e) => setFormData({ ...formData, tin_number: e.target.value })}
              placeholder="Tax Identification Number"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>First Name *</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Last Name *</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Primary Phone *</label>
              <input
                type="tel"
                value={formData.phone_primary}
                onChange={(e) => setFormData({ ...formData, phone_primary: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Secondary Phone</label>
              <input
                type="tel"
                value={formData.phone_secondary}
                onChange={(e) => setFormData({ ...formData, phone_secondary: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputClass}
            />
          </div>

          {!isNotIndividual && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>ID Type *</label>
                  <select
                    value={formData.id_type}
                    onChange={(e) => setFormData({ ...formData, id_type: e.target.value })}
                    className={inputClass}
                  >
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID</option>
                    <option value="kebele_id">Kebele ID</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>ID Number *</label>
                  <input
                    type="text"
                    value={formData.id_number}
                    onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Driver License Number *</label>
                <input
                  type="text"
                  value={formData.driver_license_number}
                  onChange={(e) =>
                    setFormData({ ...formData, driver_license_number: e.target.value })
                  }
                  required
                  className={inputClass}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>House Number</label>
              <input
                type="text"
                value={formData.house_number}
                onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Wereda</label>
              <input
                type="text"
                value={formData.wereda}
                onChange={(e) => setFormData({ ...formData, wereda: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Subcity</label>
              <select
                value={formData.subcity}
                onChange={(e) => setFormData({ ...formData, subcity: e.target.value })}
                className={inputClass}
              >
                <option value="">Select Subcity</option>
                <option value="Bole">Bole</option>
                <option value="Lideta">Lideta</option>
                <option value="Yeka">Yeka</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
