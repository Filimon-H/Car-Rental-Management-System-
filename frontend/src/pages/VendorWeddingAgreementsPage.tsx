import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Building2, Heart, Link2 } from 'lucide-react'
import { agreementsService } from '@/services/agreements'
import { VendorLookupModal } from '@/components/lookup/LookupModal'
import { VendorSearchResult } from '@/services/vendors'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-purple-100 text-purple-800',
  closed: 'bg-blue-100 text-blue-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function VendorWeddingAgreementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['vendorWeddingAgreements', page],
    queryFn: () => agreementsService.list({ page, page_size: 20 }),
  })

  // Filter for vendor_wedding agreements only
  const vendorAgreements = data?.items.filter(
    (item) => item.agreement_type === 'vendor_wedding'
  )

  const filteredItems = vendorAgreements?.filter(
    (item) =>
      item.agreement_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <Building2 className="h-6 w-6 text-purple-500" />
            <Heart className="h-4 w-4 -ml-2 text-pink-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            {t('agreements.vendorWedding.title', 'Vendor Wedding Supply')}
          </h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
        >
          <Plus className="h-5 w-5" />
          New Vendor Supply
        </button>
      </div>

      {/* Info Banner */}
      <div className="mb-6 rounded-lg bg-purple-50 p-4 text-purple-800">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          <span className="font-medium">Vendor Wedding Supply Agreements</span>
        </div>
        <p className="mt-1 text-sm">
          Track vehicles supplied by external vendors for wedding events. These can be linked to 
          customer wedding agreements for complete event management.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by agreement # or vendor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Agreement #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Event Dates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Linked Wedding
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredItems?.map((agreement) => (
                <tr
                  key={agreement.id}
                  className="cursor-pointer hover:bg-purple-50"
                  onClick={() => navigate(`/agreements/${agreement.id}`)}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-purple-400" />
                      {agreement.agreement_number}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {agreement.customer_name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(agreement.pickup_datetime)} -{' '}
                    {formatDate(agreement.expected_return_datetime)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {agreement.notes?.includes('WED-') ? (
                      <span className="flex items-center gap-1 text-pink-600">
                        <Link2 className="h-3 w-3" />
                        Linked
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatCurrency(agreement.agreed_daily_rate)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        statusColors[agreement.status]
                      }`}
                    >
                      {agreement.status}
                    </span>
                  </td>
                </tr>
              ))}
              {(!filteredItems || filteredItems.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No vendor wedding supply agreements found
                  </td>
                </tr>
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
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 20 >= data.total}
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateVendorSupplyModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

function CreateVendorSupplyModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [showVendorLookup, setShowVendorLookup] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<VendorSearchResult | null>(null)
  const [formData, setFormData] = useState({
    pickupDate: '',
    returnDate: '',
    vehicleDescription: '',
    amount: '',
    linkedWeddingNumber: '',
    notes: '',
  })

  const handleVendorSelect = (vendor: VendorSearchResult) => {
    setSelectedVendor(vendor)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // For now, just close and navigate - full implementation would create the agreement
    alert('Vendor supply agreement creation would be submitted here')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">New Vendor Wedding Supply</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vendor Selection */}
          <div>
            <label className="mb-1 block text-sm font-medium">Vendor *</label>
            {selectedVendor ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <span>{selectedVendor.company_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVendorLookup(true)}
                  className="text-sm text-purple-600 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowVendorLookup(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-gray-500 hover:border-purple-500 hover:text-purple-600"
              >
                <Search className="h-5 w-5" />
                Search and select vendor...
              </button>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Pickup Date *</label>
              <input
                type="date"
                value={formData.pickupDate}
                onChange={(e) => setFormData({ ...formData, pickupDate: e.target.value })}
                required
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Return Date *</label>
              <input
                type="date"
                value={formData.returnDate}
                onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
                required
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
          </div>

          {/* Vehicle Description */}
          <div>
            <label className="mb-1 block text-sm font-medium">Vehicle Description *</label>
            <input
              type="text"
              value={formData.vehicleDescription}
              onChange={(e) => setFormData({ ...formData, vehicleDescription: e.target.value })}
              placeholder="e.g., White Mercedes S-Class"
              required
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium">Amount (ETB) *</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          {/* Linked Wedding */}
          <div>
            <label className="mb-1 block text-sm font-medium">Linked Wedding Agreement #</label>
            <input
              type="text"
              value={formData.linkedWeddingNumber}
              onChange={(e) => setFormData({ ...formData, linkedWeddingNumber: e.target.value })}
              placeholder="e.g., WED-20250101-1234"
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">Optional - link to a customer wedding agreement</p>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedVendor}
              className="rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:opacity-50"
            >
              Create Agreement
            </button>
          </div>
        </form>

        {/* Vendor Lookup Modal */}
        <VendorLookupModal
          isOpen={showVendorLookup}
          onClose={() => setShowVendorLookup(false)}
          onSelect={handleVendorSelect}
        />
      </div>
    </div>
  )
}
