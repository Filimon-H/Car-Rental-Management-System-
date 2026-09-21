import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Building2, Phone, Edit, X } from 'lucide-react'
import {
  vendorsService,
  Vendor,
  RecordVendorPaymentData,
} from '@/services/vendors'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/apiClient'

const PAGE_SIZE = 20

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'telebirr', 'cbe_birr', 'check', 'other']

function fmt(n: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(n)
}

// ---------------------------------------------------------------------------
// Vendor Detail Panel
// ---------------------------------------------------------------------------

function VendorDetailPanel({ vendor, onClose, onEdit }: { vendor: Vendor; onClose: () => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'summary' | 'payments'>('summary')
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payForm, setPayForm] = useState<RecordVendorPaymentData>({ amount: 0, payment_method: 'cash' })
  const [payError, setPayError] = useState('')

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['vendor-summary', vendor.id],
    queryFn: () => vendorsService.getSummary(vendor.id),
    enabled: tab === 'summary',
  })

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['vendor-payments', vendor.id],
    queryFn: () => vendorsService.getPayments(vendor.id),
    enabled: tab === 'payments',
  })

  const payMutation = useMutation({
    mutationFn: (data: RecordVendorPaymentData) => vendorsService.postPayment(vendor.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payments', vendor.id] })
      queryClient.invalidateQueries({ queryKey: ['vendor-summary', vendor.id] })
      setShowPaymentForm(false)
      setPayForm({ amount: 0, payment_method: 'cash' })
      setPayError('')
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      setPayError(getErrorMessage(e, 'Failed to record payment'))
    },
  })

  const vendorName = vendor.company_name || vendor.contact_person || `Vendor #${vendor.id}`

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        aria-label="close panel"
        className="flex-1 bg-black/30"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="font-semibold text-slate-900">{vendorName}</p>
            <p className="text-xs text-slate-400 capitalize">{vendor.vendor_type} · {vendor.phone_primary}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Edit className="h-3.5 w-3.5" /> {t('common.edit')}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {(['summary', 'payments'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Summary tab ── */}
          {tab === 'summary' && (
            loadingSummary ? (
              <div className="flex h-40 items-center justify-center text-slate-400">Loading…</div>
            ) : summary ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="mb-1 font-medium text-slate-700">{t('ledger.commissionRate')}</div>
                  <div className="text-2xl font-bold text-primary">{Number(summary.commission_rate).toFixed(1)}%</div>
                  <div className="mt-0.5 text-xs text-slate-400">of rental revenue paid to this vendor</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">{t('ledger.earnedClosed')}</div>
                    <div className="mt-1 font-bold text-slate-800">{fmt(summary.earned_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">{t('ledger.reservedActive')}</div>
                    <div className="mt-1 font-bold text-slate-800">{fmt(summary.reserved_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">{t('ledger.totalPaidOut')}</div>
                    <div className="mt-1 font-bold text-green-600">{fmt(summary.paid_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-red-50 bg-red-50 p-3">
                    <div className="text-xs text-red-400">{t('ledger.outstandingOwed')}</div>
                    <div className="mt-1 font-bold text-red-600">{fmt(summary.outstanding_payable)}</div>
                  </div>
                </div>
                {summary.agreements.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('agreements.title')}</div>
                    <div className="space-y-1.5">
                      {summary.agreements.map((a) => (
                        <div key={a.agreement_id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium text-slate-800">{a.agreement_number}</span>
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">{a.agreement_status}</span>
                          </div>
                          <span className="font-medium text-slate-700">{fmt(a.payable_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null
          )}

          {/* ── Payments tab ── */}
          {tab === 'payments' && (
            <div className="space-y-4">
              <button
                onClick={() => setShowPaymentForm((v) => !v)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t('ledger.recordPayment')}
              </button>

              {showPaymentForm && (
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="mb-3 font-medium text-slate-800">{t('ledger.newPayment')}</div>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t('ledger.amountEtb')}</label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={payForm.amount || ''}
                        onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t('ledger.paymentMethod')}</label>
                      <select
                        value={payForm.payment_method}
                        onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t('ledger.referenceOptional')}</label>
                      <input
                        type="text"
                        value={payForm.payment_reference || ''}
                        onChange={(e) => setPayForm({ ...payForm, payment_reference: e.target.value })}
                        placeholder="Transaction ID, cheque number…"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t('ledger.notesOptional')}</label>
                      <input
                        type="text"
                        value={payForm.notes || ''}
                        onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    {payError && <p className="text-xs text-red-500">{payError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setShowPaymentForm(false)}
                        className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => payMutation.mutate(payForm)}
                        disabled={payMutation.isPending || !payForm.amount}
                        className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                      >
                        {payMutation.isPending ? 'Saving…' : 'Save Payment'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loadingPayments ? (
                <div className="flex h-24 items-center justify-center text-slate-400 text-sm">Loading…</div>
              ) : payments?.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                  {t('ledger.noPaymentsRecorded')}
                </div>
              ) : (
                <div className="space-y-2">
                  {payments?.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                      <div>
                        <div className="font-medium text-slate-800">{fmt(p.amount)}</div>
                        <div className="text-xs text-slate-400 capitalize">
                          {p.payment_method.replace('_', ' ')}
                          {p.payment_reference && ` · ${p.payment_reference}`}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function VendorsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors', page, debouncedSearch],
    queryFn: () =>
      vendorsService.list({ page, page_size: PAGE_SIZE, search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  })

  const handleEdit = (vendor: Vendor) => {
    navigate(`/vendors/${vendor.id}/edit`)
  }

  const columns: Column<Vendor>[] = [
    {
      key: 'vendor',
      header: t('vendors.columns.vendor', 'Vendor'),
      cell: (vendor) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {vendor.company_name || vendor.contact_person}
            </div>
            {vendor.city && (
              <div className="text-xs text-slate-400 dark:text-slate-500">{vendor.city}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('vendors.columns.contact', 'Contact'),
      cell: (vendor) => (
        <div className="flex items-center gap-1">
          <Phone className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
          {vendor.phone_primary}
        </div>
      ),
    },
    {
      key: 'bank',
      header: t('vendors.columns.bank', 'Bank'),
      className: 'text-xs text-slate-500 dark:text-slate-400',
      cell: (vendor) =>
        vendor.bank_name ? (
          <div>
            <div>{vendor.bank_name}</div>
            <div className="text-slate-400 dark:text-slate-500">{vendor.bank_account_number}</div>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: t('vendors.columns.status', 'Status'),
      cell: (vendor) => (
        <StatusBadge
          status={vendor.is_active ? 'active' : 'inactive'}
          label={vendor.is_active ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (vendor) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleEdit(vendor)
          }}
          aria-label={t('vendors.editAria', 'Edit {{name}}', {
            name: vendor.company_name || vendor.contact_person || `#${vendor.id}`,
          })}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
        >
          <Edit className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ),
    },
  ]

  return (
    <div className="p-6">
      <PageToolbar
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/vendors/new')}>
            {t('vendors.add', 'Add Vendor')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('vendors.searchLabel', 'Search vendors')}
          placeholder={t('vendors.searchPlaceholder', 'Search vendors…')}
          className="w-full sm:w-64"
        />
      </PageToolbar>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(vendor) => vendor.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(vendor) => setSelectedVendor(vendor)}
        caption={t('vendors.title', 'Vendors')}
        emptyTitle={t('vendors.empty', 'No vendors found')}
        emptyMessage={
          debouncedSearch
            ? t('vendors.emptyFiltered', 'Try a different search term.')
            : t('vendors.emptyInitial', 'Add your first vendor to get started.')
        }
        errorMessage={t('vendors.loadError', 'Error loading vendors')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('vendors.pagination', 'Vendors pagination')}
        />
      )}

      {selectedVendor && (
        <VendorDetailPanel
          vendor={selectedVendor}
          onClose={() => setSelectedVendor(null)}
          onEdit={() => handleEdit(selectedVendor)}
        />
      )}
    </div>
  )
}
