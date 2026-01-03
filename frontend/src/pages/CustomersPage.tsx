import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Edit, Trash2, Phone, Mail, UserPlus, FileSpreadsheet, AlertTriangle, X } from 'lucide-react'
import { customersService, Customer, CreateCustomerData } from '@/services/customers'
import { BulkUploadModal } from '@/components/customers/BulkUploadModal'

export default function CustomersPage() {
  const { t } = useTranslation()
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
    queryFn: () => customersService.list({ page, page_size: 20, search: searchTerm || undefined }),
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

  const handleRowClick = (customer: Customer) => {
    navigate(`/customers/${customer.id}`)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('customers.title', 'Customers')}</h1>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/customers/new')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <UserPlus className="h-5 w-5" />
            New Customer Wizard
          </button>
          <button
            onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-2 rounded-lg border border-green-600 px-4 py-2 text-green-600 hover:bg-green-50"
          >
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Upload
          </button>
          <button
            onClick={() => { setEditingCustomer(null); setShowModal(true) }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-5 w-5" />
            Quick Add
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or ID..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data?.items.map((customer) => (
                <tr 
                  key={customer.id} 
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(customer)}
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">{customer.full_name}</div>
                    {customer.city && <div className="text-sm text-gray-500">{customer.city}</div>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone className="h-4 w-4" /> {customer.phone_primary}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Mail className="h-4 w-4" /> {customer.email}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    <div>{customer.id_type || '-'}: {customer.id_number || '-'}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      customer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={(e) => handleEdit(customer, e)} className="text-blue-600 hover:text-blue-800">
                        <Edit className="h-5 w-5" />
                      </button>
                      <button onClick={(e) => handleDeleteClick(customer, e)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No customers found</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.total)} of {data.total}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['customers'] }) }}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Delete Customer</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to permanently delete <strong>{deleteConfirm.full_name}</strong>? 
                  This action cannot be undone and will remove all associated data.
                </p>
              </div>
              <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerModal({ customer, onClose, onSuccess }: { customer: Customer | null; onClose: () => void; onSuccess: () => void }) {
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
    onError: (error: any) => {
      console.error('Create customer error:', error)
      alert(error?.response?.data?.detail || 'Failed to create customer')
    }
  })
  const updateMutation = useMutation({ 
    mutationFn: (data: CreateCustomerData) => customersService.update(customer!.id, data), 
    onSuccess,
    onError: (error: any) => {
      console.error('Update customer error:', error)
      alert(error?.response?.data?.detail || 'Failed to update customer')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customer) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{customer ? 'Edit Customer' : 'Add Customer'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business Type */}
          <div>
            <label className="mb-1 block text-sm font-medium">Business Type *</label>
            <select value={formData.business_type} onChange={e => setFormData({...formData, business_type: e.target.value, company_name: e.target.value === 'individual' ? '' : formData.company_name})} className="w-full rounded-lg border px-3 py-2">
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="government">Government</option>
              <option value="embassy">Embassy</option>
              <option value="ngo">NGO</option>
              <option value="church">Church</option>
            </select>
          </div>
          {/* Company Name - only if not individual */}
          {isNotIndividual && (
            <div>
              <label className="mb-1 block text-sm font-medium">Company/Organization Name *</label>
              <input type="text" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
          )}
          {/* TIN Number */}
          <div>
            <label className="mb-1 block text-sm font-medium">TIN Number</label>
            <input type="text" value={formData.tin_number} onChange={e => setFormData({...formData, tin_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" placeholder="Tax Identification Number" />
          </div>
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
              <label className="mb-1 block text-sm font-medium">Secondary Phone</label>
              <input type="tel" value={formData.phone_secondary} onChange={e => setFormData({...formData, phone_secondary: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
          </div>
          {/* ID Type and ID Number - only for Individual */}
          {!isNotIndividual && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">ID Type *</label>
                  <select value={formData.id_type} onChange={e => setFormData({...formData, id_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID</option>
                    <option value="kebele_id">Kebele ID</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">ID Number *</label>
                  <input type="text" value={formData.id_number} onChange={e => setFormData({...formData, id_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Driver License Number *</label>
                <input type="text" value={formData.driver_license_number} onChange={e => setFormData({...formData, driver_license_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">House Number</label>
              <input type="text" value={formData.house_number} onChange={e => setFormData({...formData, house_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Wereda</label>
              <input type="text" value={formData.wereda} onChange={e => setFormData({...formData, wereda: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subcity</label>
              <select value={formData.subcity} onChange={e => setFormData({...formData, subcity: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                <option value="">Select Subcity</option>
                <option value="Bole">Bole</option>
                <option value="Lideta">Lideta</option>
                <option value="Yeka">Yeka</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50">
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
