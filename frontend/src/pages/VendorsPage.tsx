import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Edit, Phone, Plus, Search, X } from 'lucide-react'
import {
  vendorsService,
  Vendor,
  CreateVendorData,
  RecordVendorPaymentData,
} from '@/services/vendors'

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'telebirr', 'cbe_birr', 'check', 'other']

function fmt(n: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(n)
}

// ---------------------------------------------------------------------------
// Vendor Detail Panel
// ---------------------------------------------------------------------------

function VendorDetailPanel({ vendor, onClose, onEdit }: { vendor: Vendor; onClose: () => void; onEdit: () => void }) {
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
      setPayError(e?.response?.data?.detail || 'Failed to record payment')
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
              <Edit className="h-3.5 w-3.5" /> Edit
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
                  <div className="mb-1 font-medium text-slate-700">Commission Rate</div>
                  <div className="text-2xl font-bold text-primary">{Number(summary.commission_rate).toFixed(1)}%</div>
                  <div className="mt-0.5 text-xs text-slate-400">of rental revenue paid to this vendor</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">Earned (closed)</div>
                    <div className="mt-1 font-bold text-slate-800">{fmt(summary.earned_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">Reserved (active)</div>
                    <div className="mt-1 font-bold text-slate-800">{fmt(summary.reserved_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">Total Paid Out</div>
                    <div className="mt-1 font-bold text-green-600">{fmt(summary.paid_amount)}</div>
                  </div>
                  <div className="rounded-xl border border-red-50 bg-red-50 p-3">
                    <div className="text-xs text-red-400">Outstanding Owed</div>
                    <div className="mt-1 font-bold text-red-600">{fmt(summary.outstanding_payable)}</div>
                  </div>
                </div>
                {summary.agreements.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Agreements</div>
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
                Record Payment
              </button>

              {showPaymentForm && (
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="mb-3 font-medium text-slate-800">New Payment</div>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Amount (ETB)</label>
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
                      <label className="mb-1 block text-xs font-medium text-slate-600">Payment Method</label>
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
                      <label className="mb-1 block text-xs font-medium text-slate-600">Reference (optional)</label>
                      <input
                        type="text"
                        value={payForm.payment_reference || ''}
                        onChange={(e) => setPayForm({ ...payForm, payment_reference: e.target.value })}
                        placeholder="Transaction ID, cheque number…"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
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
                        Cancel
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
                  No payments recorded yet
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
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', page, searchTerm],
    queryFn: () => vendorsService.list({ page, page_size: 20, search: searchTerm || undefined }),
  })

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setSelectedVendor(null)
    setShowModal(true)
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendors…"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => { setEditingVendor(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Vendor
        </button>
      </div>

      <div className="app-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">Loading…</td></tr>
              )}
              {!isLoading && !data?.items.length && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">No vendors found</td></tr>
              )}
              {data?.items.map((vendor) => (
                <tr
                  key={vendor.id}
                  className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/60"
                  onClick={() => setSelectedVendor(vendor)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <div>
                        <div className="font-medium text-slate-900">{vendor.company_name || vendor.contact_person}</div>
                        {vendor.city && <div className="text-xs text-slate-400">{vendor.city}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-slate-300" />
                      {vendor.phone_primary}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {vendor.bank_name ? (
                      <div>
                        <div>{vendor.bank_name}</div>
                        <div className="text-slate-400">{vendor.bank_account_number}</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {Number(vendor.commission_rate).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      vendor.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {vendor.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(vendor) }}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.total > 20 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>{data.total} vendors · page {page}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {selectedVendor && (
        <VendorDetailPanel
          vendor={selectedVendor}
          onClose={() => setSelectedVendor(null)}
          onEdit={() => handleEdit(selectedVendor)}
        />
      )}

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

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

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
    commission_rate: vendor?.commission_rate ?? 70,
    notes: vendor?.notes || '',
  })

  const isCompany = formData.vendor_type === 'company'
  const createMutation = useMutation({ mutationFn: vendorsService.create, onSuccess })
  const updateMutation = useMutation({ mutationFn: (data: CreateVendorData) => vendorsService.update(vendor!.id, data), onSuccess })
  const isLoading = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    vendor ? updateMutation.mutate(formData) : createMutation.mutate(formData)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select value={formData.vendor_type} onChange={e => setFormData({...formData, vendor_type: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="company">Company</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          {isCompany && (
            <div>
              <label className="mb-1 block text-sm font-medium">Company Name *</label>
              <input required type="text" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Contact Person {!isCompany && '*'}</label>
            <input type="text" required={!isCompany} value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Primary Phone *</label>
              <input required type="tel" value={formData.phone_primary} onChange={e => setFormData({...formData, phone_primary: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Secondary Phone</label>
              <input type="tel" value={formData.phone_secondary} onChange={e => setFormData({...formData, phone_secondary: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Commission Rate % <span className="text-slate-400 font-normal">(% of rental revenue paid to vendor)</span></label>
            <input type="number" min="0" max="100" step="0.5" value={formData.commission_rate} onChange={e => setFormData({...formData, commission_rate: Number(e.target.value)})} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="border-t pt-3">
            <div className="mb-2 text-sm font-medium">Bank Information</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bank Name</label>
                <input type="text" value={formData.bank_name} onChange={e => setFormData({...formData, bank_name: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Account Number</label>
                <input type="text" value={formData.bank_account_number} onChange={e => setFormData({...formData, bank_account_number: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">Account Holder</label>
              <input type="text" value={formData.bank_account_holder} onChange={e => setFormData({...formData, bank_account_holder: e.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50">
              {isLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
