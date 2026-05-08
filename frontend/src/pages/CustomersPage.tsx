import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  UserPlus,
  FileSpreadsheet,
  AlertTriangle,
  X,
} from 'lucide-react'
import { customersService, Customer, CreateCustomerData } from '@/services/customers'
import { BulkUploadModal } from '@/components/customers/BulkUploadModal'

export default function CustomersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, searchTerm],
    queryFn: () =>
      customersService.list({ page, page_size: 20, search: searchTerm || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: customersService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })

  const handleEdit = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/customers/${customer.id}/edit`)
  }

  const handleDeleteClick = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirm(customer)
  }

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id)
      setDeleteConfirm(null)
    }
  }

  return (
    <div className="p-6 page-fade">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Bulk Upload
          </button>
          <button
            onClick={() => {
              setEditingCustomer(null)
              setShowModal(true)
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Quick Add
          </button>
          <button
            onClick={() => navigate('/customers/new')}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <UserPlus className="h-4 w-4" />
            New Customer
          </button>
        </div>
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
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Contact
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  ID
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
              {data?.items.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="text-sm font-semibold text-slate-800">{customer.full_name}</div>
                    {customer.city && (
                      <div className="text-xs text-slate-400">{customer.city}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {customer.phone_primary}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Mail className="h-3.5 w-3.5" />
                        {customer.email}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">
                    {customer.id_type || '—'}: {customer.id_number || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        customer.is_active
                          ? 'bg-green-50 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          customer.is_active ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                      />
                      {customer.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => handleEdit(customer, e)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(customer, e)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
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
                    No customers found
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900">Delete Customer</h3>
                <p className="mt-1.5 text-sm text-slate-500">
                  Are you sure you want to permanently delete{' '}
                  <strong className="text-slate-700">{deleteConfirm.full_name}</strong>? This action
                  cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
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
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || 'Failed to create customer')
    },
  })
  const updateMutation = useMutation({
    mutationFn: (data: CreateCustomerData) => customersService.update(customer!.id, data),
    onSuccess,
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || 'Failed to update customer')
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
