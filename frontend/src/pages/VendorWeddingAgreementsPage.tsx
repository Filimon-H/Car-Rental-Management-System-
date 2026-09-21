import { type FormEvent, useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Building2, Heart, Link2 } from 'lucide-react'
import { agreementsService } from '@/services/agreements'
import { VendorLookupModal } from '@/components/lookup/LookupModal'
import { VendorSearchResult } from '@/services/vendors'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const PAGE_SIZE = 20

interface VendorSupplyRow {
  id: number
  agreement_number: string
  customer_name: string
  pickup_datetime: string
  expected_return_datetime: string
  agreed_daily_rate: number
  status: string
  notes?: string | null
}

export default function VendorWeddingAgreementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendorWeddingAgreements', page, debouncedSearch],
    queryFn: () =>
      agreementsService.list({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        // Filtered server-side; filtering the page client-side made the totals and
        // paging count every other agreement type too.
        agreement_type: 'vendor_wedding',
      }),
    placeholderData: keepPreviousData,
  })

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const columns: Column<VendorSupplyRow>[] = [
    {
      key: 'number',
      header: t('agreements.columns.number', 'Agreement #'),
      className: 'whitespace-nowrap font-medium text-slate-900 dark:text-slate-100',
      cell: (agreement) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 flex-shrink-0 text-purple-400" aria-hidden="true" />
          {agreement.agreement_number}
        </div>
      ),
    },
    {
      key: 'vendor',
      header: t('agreements.vendorWedding.vendor', 'Vendor'),
      className: 'whitespace-nowrap',
      cell: (agreement) => agreement.customer_name,
    },
    {
      key: 'dates',
      header: t('agreements.wedding.eventDates', 'Event Dates'),
      className: 'whitespace-nowrap text-slate-500 dark:text-slate-400',
      cell: (agreement) =>
        `${formatDate(agreement.pickup_datetime)} – ${formatDate(agreement.expected_return_datetime)}`,
    },
    {
      key: 'linked',
      header: t('agreements.vendorWedding.linkedWedding', 'Linked Wedding'),
      className: 'whitespace-nowrap',
      cell: (agreement) =>
        agreement.notes?.includes('WED-') ? (
          <span className="flex items-center gap-1 text-pink-600 dark:text-pink-400">
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {t('agreements.vendorWedding.linked', 'Linked')}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        ),
    },
    {
      key: 'amount',
      header: t('agreements.columns.amount', 'Amount'),
      className: 'whitespace-nowrap',
      cell: (agreement) => formatCurrency(agreement.agreed_daily_rate),
    },
    {
      key: 'status',
      header: t('agreements.columns.status', 'Status'),
      cell: (agreement) => <StatusBadge status={agreement.status} />,
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center">
          <Building2 className="h-6 w-6 text-purple-500" aria-hidden="true" />
          <Heart className="-ml-2 h-4 w-4 text-pink-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {t('agreements.vendorWedding.title', 'Vendor Wedding Supply')}
        </h1>
      </div>

      {/* Info Banner */}
      <div className="mb-6 rounded-lg bg-purple-50 p-4 text-purple-800 dark:bg-purple-500/10 dark:text-purple-200">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5" aria-hidden="true" />
          <span className="font-medium">
            {t('agreements.vendorWedding.bannerTitle', 'Vendor Wedding Supply Agreements')}
          </span>
        </div>
        <p className="mt-1 text-sm">
          {t(
            'agreements.vendorWedding.bannerBody',
            'Track vehicles supplied by external vendors for wedding events. These can be linked to customer wedding agreements for complete event management.'
          )}
        </p>
      </div>

      <PageToolbar
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-500 hover:bg-purple-600 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            {t('agreements.vendorWedding.createNew', 'New Vendor Supply')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('agreements.vendorWedding.searchLabel', 'Search vendor supply agreements')}
          placeholder={t(
            'agreements.vendorWedding.searchPlaceholder',
            'Search by agreement # or vendor...'
          )}
          className="w-full sm:max-w-md"
        />
      </PageToolbar>

      <DataTable
        columns={columns}
        rows={data?.items as VendorSupplyRow[] | undefined}
        rowKey={(agreement) => agreement.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(agreement) => navigate(`/agreements/${agreement.id}`)}
        caption={t('agreements.vendorWedding.title', 'Vendor Wedding Supply')}
        emptyTitle={t(
          'agreements.vendorWedding.empty',
          'No vendor wedding supply agreements found'
        )}
        emptyMessage={
          debouncedSearch
            ? t('agreements.emptyFiltered', 'Try a different search term.')
            : t(
                'agreements.vendorWedding.emptyInitial',
                'Record a vendor supply agreement to get started.'
              )
        }
        errorMessage={t('agreements.loadError', 'Error loading agreements')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('agreements.vendorWedding.pagination', 'Vendor supply pagination')}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateVendorSupplyModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

function CreateVendorSupplyModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // For now, just close and navigate - full implementation would create the agreement
    alert('Vendor supply agreement creation would be submitted here')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{t('vendorPage.newWeddingSupply')}</h2>
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
                  {t('agreementCreate.change')}
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
            <label className="mb-1 block text-sm font-medium">{t('agreementCreate.notes')}</label>
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!selectedVendor}
              className="rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {t('agreementCreate.createAgreement')}
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
