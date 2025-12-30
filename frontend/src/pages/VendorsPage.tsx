import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Edit, Trash2, Phone, Building2 } from 'lucide-react'
import { vendorsService, Vendor, CreateVendorData } from '@/services/vendors'

export default function VendorsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', page, searchTerm],
    queryFn: () => vendorsService.list({ page, page_size: 20, search: searchTerm || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: vendorsService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setShowModal(true)
  }

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('vendors.title', 'Vendors')}</h1>
        <button
          onClick={() => { setEditingVendor(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Add Vendor
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by company or contact..."
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
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bank Info</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data?.items.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">{vendor.company_name}</div>
                        {vendor.city && <div className="text-sm text-gray-500">{vendor.city}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {vendor.contact_person && <div className="text-sm text-gray-900">{vendor.contact_person}</div>}
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone className="h-4 w-4" /> {vendor.phone_primary}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {vendor.bank_name ? (
                      <div>
                        <div>{vendor.bank_name}</div>
                        <div className="text-gray-400">{vendor.bank_account_number}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      vendor.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {vendor.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(vendor)} className="text-blue-600 hover:text-blue-800">
                        <Edit className="h-5 w-5" />
                      </button>
                      <button onClick={() => handleDelete(vendor.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No vendors found</td></tr>
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
        <VendorModal
          vendor={editingVendor}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['vendors'] }) }}
        />
      )}
    </div>
  )
}

function VendorModal({ vendor, onClose, onSuccess }: { vendor: Vendor | null; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState<CreateVendorData>({
    vendor_type: vendor?.vendor_type || 'company',
    company_name: vendor?.company_name || '',
    contact_person: vendor?.contact_person || '',
    phone_primary: vendor?.phone_primary || '',
    phone_secondary: vendor?.phone_secondary || '',
    email: vendor?.email || '',
    address: vendor?.address || '',
    city: vendor?.city || '',
    bank_name: vendor?.bank_name || '',
    bank_account_number: vendor?.bank_account_number || '',
    bank_account_holder: vendor?.bank_account_holder || '',
    notes: vendor?.notes || '',
  })

  const isCompany = formData.vendor_type === 'company'

  const createMutation = useMutation({ mutationFn: vendorsService.create, onSuccess })
  const updateMutation = useMutation({ mutationFn: (data: CreateVendorData) => vendorsService.update(vendor!.id, data), onSuccess })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (vendor) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Vendor Type *</label>
            <select value={formData.vendor_type} onChange={e => setFormData({...formData, vendor_type: e.target.value, company_name: e.target.value === 'individual' ? '' : formData.company_name})} className="w-full rounded-lg border px-3 py-2">
              <option value="company">Company</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          {isCompany && (
            <div>
              <label className="mb-1 block text-sm font-medium">Company Name *</label>
              <input type="text" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Contact Person {!isCompany && '*'}</label>
            <input type="text" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} required={!isCompany} className="w-full rounded-lg border px-3 py-2" />
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Address</label>
              <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 font-medium">Bank Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Bank Name</label>
                <input type="text" value={formData.bank_name} onChange={e => setFormData({...formData, bank_name: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Account Number</label>
                <input type="text" value={formData.bank_account_number} onChange={e => setFormData({...formData, bank_account_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium">Account Holder</label>
              <input type="text" value={formData.bank_account_holder} onChange={e => setFormData({...formData, bank_account_holder: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
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
