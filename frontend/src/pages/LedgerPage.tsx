import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  DollarSign, Search, Filter,
  RotateCcw, X, Users, Truck, BarChart2, ChevronDown,
  ChevronRight, Building2, User, Download,
} from 'lucide-react'
import { agreementsService, ledgerService, LedgerEntry } from '@/services/agreements'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/use-toast'
import customersService, { CustomerLedgerEntry } from '@/services/customers'
import vendorsService from '@/services/vendors'

// ─── Shared helpers ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  charge: 'Rental Charge',
  payment: 'Payment',
  deposit: 'Deposit Received',
  deposit_applied: 'Deposit Applied',
  deposit_return: 'Deposit Return',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  damage_charge: 'Damage Charge',
  late_fee: 'Late Fee',
}

const TYPE_BADGE: Record<string, string> = {
  charge: 'bg-red-100 text-red-800',
  payment: 'bg-green-100 text-green-800',
  deposit: 'bg-blue-100 text-blue-800',
  deposit_applied: 'bg-indigo-100 text-indigo-800',
  deposit_return: 'bg-teal-100 text-teal-800',
  adjustment: 'bg-yellow-100 text-yellow-800',
  reversal: 'bg-amber-100 text-amber-800',
  damage_charge: 'bg-red-200 text-red-900',
  late_fee: 'bg-orange-100 text-orange-800',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  telebirr: 'TeleBirr',
  cbe_birr: 'CBE Birr',
  check: 'Cheque',
  other: 'Other',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(Math.abs(n))
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// ─── Reverse modal ─────────────────────────────────────────────────────────────

function ReverseModal({
  entry, onClose, onConfirm, isLoading,
}: {
  entry: LedgerEntry
  onClose: () => void
  onConfirm: (reason: string) => void
  isLoading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Reverse Ledger Entry</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Entry to reverse:</p>
          <p className="mt-1">{entry.description} — {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()} ETB</p>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this entry is being reversed..."
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || isLoading}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isLoading ? 'Reversing...' : 'Confirm Reversal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, sub }: {
  label: string; value: string; color: 'red' | 'green' | 'blue' | 'orange' | 'teal' | 'gray'; sub?: string
}) {
  const colors = {
    red: 'border-red-100 bg-red-50',
    green: 'border-green-100 bg-green-50',
    blue: 'border-blue-100 bg-blue-50',
    orange: 'border-orange-100 bg-orange-50',
    teal: 'border-teal-100 bg-teal-50',
    gray: 'border-gray-100 bg-gray-50',
  }
  const textColors = {
    red: 'text-red-700',
    green: 'text-green-700',
    blue: 'text-blue-700',
    orange: 'text-orange-700',
    teal: 'text-teal-700',
    gray: 'text-gray-700',
  }
  const labelColors = {
    red: 'text-red-500',
    green: 'text-green-600',
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    teal: 'text-teal-500',
    gray: 'text-gray-500',
  }
  return (
    <div className={`rounded-lg border px-4 py-3 ${colors[color]}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelColors[color]}`}>{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

// ─── Tab: Customers ────────────────────────────────────────────────────────────

function CustomersTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null)
  const [reversingEntry, setReversingEntry] = useState<LedgerEntry | null>(null)
  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set())

  const { data: customers } = useQuery({
    queryKey: ['customers-search', search],
    queryFn: () => customersService.search(search, 30),
    enabled: search.length >= 1,
  })

  const { data: entries, isLoading } = useQuery({
    queryKey: ['customer-ledger', selectedCustomer?.id],
    queryFn: () => customersService.getLedger(selectedCustomer!.id),
    enabled: !!selectedCustomer,
  })

  const reverseMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      ledgerService.reverseEntry(entryId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', selectedCustomer?.id] })
      setReversingEntry(null)
    },
  })

  // Group by agreement
  const grouped: Record<string, CustomerLedgerEntry[]> = {}
  entries?.forEach(e => {
    const key = e.agreement_number
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  })

  const toggleAgreement = (key: string) => {
    setExpandedAgreements(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  // Totals across all entries
  const totalCharged = entries?.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0) ?? 0
  const totalPaid = entries?.filter(e => e.entry_type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0) ?? 0
  const totalDeposits = entries?.filter(e => e.entry_type === 'deposit').reduce((s, e) => s + Math.abs(e.amount), 0) ?? 0
  const balance = entries?.reduce((s, e) => s + e.amount, 0) ?? 0

  const isReversed = (id: number) => entries?.some(e => e.reversed_entry_id === id) ?? false

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Left: Customer search */}
      <div className="lg:col-span-1">
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-gray-700">Select Customer</h2>
          </div>
          <div className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Type name or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {customers?.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCustomer({ id: c.id, name: c.full_name }); setExpandedAgreements(new Set()) }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedCustomer?.id === c.id ? 'bg-blue-50 ring-1 ring-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-medium">{c.full_name}</span>
                  </div>
                  <p className="mt-0.5 pl-5 text-xs text-gray-500">{c.phone_primary}</p>
                </button>
              ))}
              {search.length >= 1 && !customers?.length && (
                <p className="py-4 text-center text-xs text-gray-500">No customers found</p>
              )}
              {search.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-500">Start typing to search</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Ledger */}
      <div className="lg:col-span-3">
        {!selectedCustomer ? (
          <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
            <div className="text-center text-gray-500">
              <Users className="mx-auto mb-2 h-12 w-12 opacity-30" />
              <p>Search for a customer to view their ledger</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Customer header */}
            <div className="flex items-center justify-between rounded-lg bg-white px-5 py-4 shadow">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500">{Object.keys(grouped).length} agreement{Object.keys(grouped).length !== 1 ? 's' : ''} · {entries?.length ?? 0} entries</p>
                </div>
              </div>
            </div>

            {/* Summary cards */}
            {entries && entries.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Total Charged" value={fmt(totalCharged)} color="red" />
                <SummaryCard label="Total Paid" value={fmt(totalPaid)} color="green" />
                <SummaryCard label="Deposit Held" value={fmt(totalDeposits)} color="blue" />
                <SummaryCard
                  label={balance > 0 ? 'Balance Due' : balance < 0 ? 'Overpaid' : 'Settled'}
                  value={fmt(balance)}
                  color={balance > 0 ? 'orange' : balance < 0 ? 'teal' : 'gray'}
                />
              </div>
            )}

            {/* Grouped by agreement */}
            {Object.keys(grouped).length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white py-12 text-center text-gray-500">
                No ledger entries for this customer
              </div>
            )}

            {Object.entries(grouped).map(([agrNum, agrEntries]) => {
              const expanded = expandedAgreements.has(agrNum)
              const agrCharged = agrEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
              const agrPaid = agrEntries.filter(e => e.entry_type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0)
              const agrBalance = agrEntries.reduce((s, e) => s + e.amount, 0)

              return (
                <div key={agrNum} className="overflow-hidden rounded-lg bg-white shadow">
                  {/* Agreement header row */}
                  <button
                    onClick={() => toggleAgreement(agrNum)}
                    className="flex w-full items-center justify-between px-5 py-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-mono text-sm font-semibold text-gray-700">{agrNum}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {agrEntries.length} {agrEntries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-red-600">Charged: <strong>{fmt(agrCharged)}</strong></span>
                      <span className="text-green-600">Paid: <strong>{fmt(agrPaid)}</strong></span>
                      <span className={`font-bold ${agrBalance > 0 ? 'text-orange-600' : agrBalance < 0 ? 'text-teal-600' : 'text-gray-500'}`}>
                        {agrBalance > 0 ? 'Owes' : agrBalance < 0 ? 'Overpaid' : 'Settled'}: {fmt(agrBalance)}
                      </span>
                    </div>
                  </button>

                  {/* Entries table */}
                  {expanded && (
                    <div className="border-t">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">#</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-red-500">Debit</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-green-600">Credit</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(() => {
                            let running = 0
                            return agrEntries.map((e, i) => {
                              running += e.amount
                              const reversed = isReversed(e.id)
                              return (
                                <tr key={e.id} className={`${e.entry_type === 'reversal' ? 'bg-amber-50' : 'hover:bg-gray-50'} ${reversed ? 'opacity-50' : ''}`}>
                                  <td className="px-4 py-2.5 text-xs text-gray-500">{i + 1}</td>
                                  <td className="whitespace-nowrap px-4 py-2.5">
                                    <p className="font-medium text-gray-700">{fmtDate(e.created_at)}</p>
                                    <p className="text-xs text-gray-500">{fmtTime(e.created_at)}</p>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[e.entry_type] ?? 'bg-gray-100 text-gray-700'} ${reversed ? 'line-through opacity-70' : ''}`}>
                                      {TYPE_LABELS[e.entry_type] ?? e.entry_type}
                                    </span>
                                    {reversed && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"><RotateCcw className="h-2.5 w-2.5" />rev</span>}
                                  </td>
                                  <td className="max-w-xs px-4 py-2.5">
                                    <p className={`text-gray-700 ${reversed ? 'line-through' : ''}`}>{e.description}</p>
                                    {e.payment_method && <p className="text-xs text-gray-500">{PAYMENT_LABELS[e.payment_method] ?? e.payment_method}{e.payment_reference && ` · Ref: ${e.payment_reference}`}</p>}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                                    {e.amount > 0 ? <span className="font-semibold text-red-600">{fmt(e.amount)}</span> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                                    {e.amount < 0 ? <span className="font-semibold text-green-600">{fmt(e.amount)}</span> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                                    <span className={`font-bold ${running > 0 ? 'text-red-700' : running < 0 ? 'text-teal-600' : 'text-gray-500'}`}>{fmt(running)}</span>
                                    <p className={`text-xs font-normal ${running > 0 ? 'text-red-400' : running < 0 ? 'text-teal-400' : 'text-gray-400'}`}>{running > 0 ? 'owed' : running < 0 ? 'overpaid' : 'settled'}</p>
                                  </td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {reversingEntry && (
        <ReverseModal
          entry={reversingEntry}
          onClose={() => setReversingEntry(null)}
          onConfirm={reason => reverseMutation.mutate({ entryId: reversingEntry.id, reason })}
          isLoading={reverseMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── Tab: Per-Agreement (original) ────────────────────────────────────────────

function AgreementsTab() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAgreement, setSelectedAgreement] = useState<number | null>(null)
  const [reversingEntry, setReversingEntry] = useState<LedgerEntry | null>(null)

  const { data: agreements } = useQuery({
    queryKey: ['agreements'],
    queryFn: () => agreementsService.list({ page_size: 100 }),
  })

  const { data: ledgerEntries, isLoading } = useQuery({
    queryKey: ['ledger', selectedAgreement],
    queryFn: () => agreementsService.getLedger(selectedAgreement!),
    enabled: !!selectedAgreement,
  })

  const reverseMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      ledgerService.reverseEntry(entryId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger', selectedAgreement] })
      setReversingEntry(null)
    },
  })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const entriesWithBalance = ledgerEntries?.reduce((acc, entry, index) => {
    const prevBalance = index > 0 ? acc[index - 1].runningBalance : 0
    const runningBalance = prevBalance + entry.amount
    return [...acc, { ...entry, runningBalance }]
  }, [] as (LedgerEntry & { runningBalance: number })[])

  const filteredAgreements = agreements?.items.filter(
    a =>
      a.agreement_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalCharges = entriesWithBalance?.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0) ?? 0
  const totalPayments = entriesWithBalance?.filter(e => e.amount < 0 && e.entry_type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0) ?? 0
  const depositHeld = entriesWithBalance?.filter(e => e.entry_type === 'deposit').reduce((s, e) => s + Math.abs(e.amount), 0) ?? 0
  const currentBalance = entriesWithBalance?.[entriesWithBalance.length - 1]?.runningBalance ?? 0

  const isReversible = (entry: LedgerEntry) =>
    !entry.entry_type.startsWith('reversal') && entry.reversed_entry_id === null

  const isReversed = (id: number) =>
    (ledgerEntries ?? []).some(e => e.reversed_entry_id === id)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-gray-700">Select Agreement</h2>
          </div>
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
              />
            </div>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {filteredAgreements?.map(agreement => (
                <button
                  key={agreement.id}
                  onClick={() => setSelectedAgreement(agreement.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedAgreement === agreement.id ? 'bg-green-50 ring-1 ring-green-500' : ''
                  }`}
                >
                  <div className="font-medium">{agreement.agreement_number}</div>
                  <div className="text-xs text-gray-500">{agreement.customer_name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3">
        {!selectedAgreement ? (
          <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
            <div className="text-center text-gray-500">
              <Filter className="mx-auto mb-2 h-12 w-12 opacity-30" />
              <p>Select an agreement to view ledger</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-4 gap-3">
              <SummaryCard label="Total Charged" value={formatCurrency(totalCharges)} color="red" />
              <SummaryCard label="Total Paid" value={formatCurrency(totalPayments)} color="green" />
              <SummaryCard label="Deposit Held" value={formatCurrency(depositHeld)} color="blue" />
              <SummaryCard
                label={currentBalance > 0 ? 'Balance Due' : currentBalance < 0 ? 'Overpaid' : 'Settled'}
                value={formatCurrency(Math.abs(currentBalance))}
                color={currentBalance > 0 ? 'orange' : currentBalance < 0 ? 'teal' : 'gray'}
              />
            </div>

            <div className="rounded-lg bg-white shadow">
              <div className="border-b px-6 py-4">
                <h2 className="font-semibold text-gray-700">Ledger Entries</h2>
              </div>
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-8 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">#</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date / Time</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-500">Debit</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-green-600">Credit</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Balance</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {entriesWithBalance?.map((entry, idx) => {
                      const reversed = isReversed(entry.id)
                      return (
                        <tr key={entry.id} className={`${entry.entry_type === 'reversal' ? 'bg-amber-50' : 'hover:bg-gray-50'} ${reversed ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-3 text-center text-xs text-gray-500">{idx + 1}</td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <p className="font-medium text-gray-700">{new Date(entry.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                            <p className="text-xs text-gray-500">{new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[entry.entry_type] ?? 'bg-gray-100 text-gray-700'} ${reversed ? 'line-through opacity-70' : ''}`}>
                              {TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
                            </span>
                            {reversed && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"><RotateCcw className="h-2.5 w-2.5" />reversed</span>}
                          </td>
                          <td className="max-w-xs px-5 py-3">
                            <p className={`text-gray-700 ${reversed ? 'line-through' : ''}`}>{entry.description}</p>
                            {entry.payment_method && <p className="mt-0.5 text-xs text-gray-500">{entry.payment_method.replace(/_/g, ' ')}{entry.payment_reference && <> · Ref: <span className="font-mono">{entry.payment_reference}</span></>}</p>}
                            {entry.created_by_name && <p className="mt-0.5 text-xs text-gray-500">by {entry.created_by_name}</p>}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">{entry.amount > 0 ? <span className="font-semibold text-red-600">{formatCurrency(entry.amount)}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">{entry.amount < 0 ? <span className="font-semibold text-green-600">{formatCurrency(Math.abs(entry.amount))}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            <span className={`font-bold ${entry.runningBalance > 0 ? 'text-red-700' : entry.runningBalance < 0 ? 'text-teal-600' : 'text-gray-500'}`}>{formatCurrency(Math.abs(entry.runningBalance))}</span>
                            <p className={`text-xs font-normal ${entry.runningBalance > 0 ? 'text-red-400' : entry.runningBalance < 0 ? 'text-teal-400' : 'text-gray-400'}`}>{entry.runningBalance > 0 ? 'owed' : entry.runningBalance < 0 ? 'overpaid' : 'settled'}</p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            {isReversible(entry) && (
                              <button onClick={() => setReversingEntry(entry)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50">
                                <RotateCcw className="h-3 w-3" />Reverse
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {(!entriesWithBalance || entriesWithBalance.length === 0) && (
                      <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500">No ledger entries found</td></tr>
                    )}
                  </tbody>
                  {entriesWithBalance && entriesWithBalance.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50">
                        <td colSpan={4} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Totals ({entriesWithBalance.length} {entriesWithBalance.length === 1 ? 'entry' : 'entries'})</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-700">{formatCurrency(totalCharges)}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totalPayments)}</td>
                        <td className={`px-5 py-3 text-right text-sm font-bold ${currentBalance > 0 ? 'text-red-700' : currentBalance < 0 ? 'text-teal-600' : 'text-gray-600'}`}>{formatCurrency(Math.abs(currentBalance))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {reversingEntry && (
        <ReverseModal
          entry={reversingEntry}
          onClose={() => setReversingEntry(null)}
          onConfirm={reason => reverseMutation.mutate({ entryId: reversingEntry.id, reason })}
          isLoading={reverseMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── Tab: Vendors ──────────────────────────────────────────────────────────────

function VendorsTab() {
  const [search, setSearch] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<{ id: number; name: string } | null>(null)

  const { data: vendorList } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => vendorsService.list({ page_size: 50, search }),
  })

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['vendor-payments', selectedVendor?.id],
    queryFn: () => vendorsService.getPayments(selectedVendor!.id),
    enabled: !!selectedVendor,
  })

  const { data: summary } = useQuery({
    queryKey: ['vendor-summary', selectedVendor?.id],
    queryFn: () => vendorsService.getSummary(selectedVendor!.id),
    enabled: !!selectedVendor,
  })

  const totalPaid = payments?.reduce((s, p) => s + p.amount, 0) ?? 0

  const vendorName = (v: { company_name: string | null; contact_person: string | null }) =>
    v.company_name || v.contact_person || 'Unknown'

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Vendor list */}
      <div className="lg:col-span-1">
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-gray-700">Select Vendor</h2>
          </div>
          <div className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
              />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {vendorList?.items.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVendor({ id: v.id, name: vendorName(v) })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedVendor?.id === v.id ? 'bg-blue-50 ring-1 ring-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-medium">{vendorName(v)}</span>
                  </div>
                  <p className="mt-0.5 pl-5 text-xs text-gray-500">{v.phone_primary} · {v.commission_rate}% commission</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vendor detail */}
      <div className="lg:col-span-3">
        {!selectedVendor ? (
          <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
            <div className="text-center text-gray-500">
              <Truck className="mx-auto mb-2 h-12 w-12 opacity-30" />
              <p>Select a vendor to view their payment history</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-lg bg-white px-5 py-4 shadow">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{selectedVendor.name}</p>
                  <p className="text-xs text-gray-500">{payments?.length ?? 0} payments recorded</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Total Earned" value={fmt(summary.earned_amount)} color="blue" sub="from completed rentals" />
                <SummaryCard label="Total Paid Out" value={fmt(summary.paid_amount)} color="green" sub="payments sent to vendor" />
                <SummaryCard label="Outstanding" value={fmt(summary.outstanding_payable)} color={summary.outstanding_payable > 0 ? 'orange' : 'gray'} sub="still owed to vendor" />
                <SummaryCard label="Agreements" value={String(summary.agreement_count)} color="gray" sub="total rentals" />
              </div>
            )}

            {/* Payments table */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="border-b px-5 py-3">
                <h3 className="font-semibold text-gray-700">Payment History — Money Paid to Vendor</h3>
                <p className="text-xs text-gray-500">These are outgoing payments from NOD Car Rental to the vendor</p>
              </div>
              {paymentsLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                </div>
              ) : !payments?.length ? (
                <div className="py-10 text-center text-gray-500">No payments recorded yet</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Agreement</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Method</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-purple-600">Amount Paid Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-medium text-gray-700">{fmtDate(p.created_at)}</p>
                          <p className="text-xs text-gray-500">{fmtTime(p.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {p.agreement_id ? `AGR-#${p.agreement_id}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                            {PAYMENT_LABELS[p.payment_method] ?? p.payment_method}
                          </span>
                          {p.payment_reference && <p className="mt-0.5 text-xs text-gray-500">Ref: {p.payment_reference}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{p.notes ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-purple-700">
                          {fmt(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Total paid out ({payments.length} payments)
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-purple-700">
                        {fmt(totalPaid)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Financial Summary ────────────────────────────────────────────────────

function SummaryTab() {
  const [granularity, setGranularity] = useState<'daily' | 'monthly' | 'yearly'>('monthly')

  const { data: periods, isLoading } = useQuery({
    queryKey: ['ledger-summary', granularity],
    queryFn: () => ledgerService.getSummary(granularity),
  })

  const grandTotalCharged = periods?.reduce((s, p) => s + p.total_charged, 0) ?? 0
  const grandTotalPayments = periods?.reduce((s, p) => s + p.total_payments, 0) ?? 0
  const grandVendorPaid = periods?.reduce((s, p) => s + p.vendor_paid, 0) ?? 0
  const grandNet = periods?.reduce((s, p) => s + p.net_revenue, 0) ?? 0

  const GRAN_LABELS = { daily: 'Day', monthly: 'Month', yearly: 'Year' }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Financial Summary</h3>
          <p className="text-xs text-gray-500">Revenue and payouts aggregated by period</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
          {(['daily', 'monthly', 'yearly'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                granularity === g
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="All-time Revenue Charged" value={fmt(grandTotalCharged)} color="red" sub="total billed to customers" />
        <SummaryCard label="All-time Payments Received" value={fmt(grandTotalPayments)} color="green" sub="cash collected from customers" />
        <SummaryCard label="All-time Vendor Paid Out" value={fmt(grandVendorPaid)} color="blue" sub="sent to vehicle vendors" />
        <SummaryCard label="Net Revenue" value={fmt(Math.abs(grandNet))} color={grandNet >= 0 ? 'teal' : 'orange'} sub={grandNet >= 0 ? 'profit after vendor costs' : 'net loss'} />
      </div>

      {/* Period table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="border-b px-5 py-3">
          <h3 className="font-semibold text-gray-700">By {GRAN_LABELS[granularity]}</h3>
        </div>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : !periods?.length ? (
          <div className="py-12 text-center text-gray-500">No data available</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{GRAN_LABELS[granularity]}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-red-500">Charged</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-green-600">Collected</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-blue-500">Deposits</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-purple-600">Vendor Paid</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-teal-600">Net Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...periods].reverse().map(p => (
                <tr key={p.period} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono font-semibold text-gray-700">{p.period}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-red-600">{fmt(p.total_charged)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-green-600">{fmt(p.total_payments)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-blue-500">{fmt(p.total_deposits)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-purple-600">{fmt(p.vendor_paid)}</td>
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${p.net_revenue >= 0 ? 'text-teal-700' : 'text-red-700'}`}>
                    {p.net_revenue >= 0 ? '' : '−'}{fmt(p.net_revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Grand Total</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-red-700">{fmt(grandTotalCharged)}</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-green-700">{fmt(grandTotalPayments)}</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">—</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-purple-700">{fmt(grandVendorPaid)}</td>
                <td className={`px-5 py-3 text-right text-sm font-bold ${grandNet >= 0 ? 'text-teal-700' : 'text-red-700'}`}>{fmt(Math.abs(grandNet))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'customers' | 'agreements' | 'vendors' | 'summary'

export default function LedgerPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('customers')
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await ledgerService.exportCsv()
    } catch {
      toast({
        variant: 'destructive',
        title: t('ledger.exportFailed', 'Export failed'),
        description: t('ledger.exportFailedBody', 'Could not download the ledger CSV.'),
      })
    } finally {
      setIsExporting(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'customers',
      label: 'By Customer',
      icon: <Users className="h-4 w-4" />,
      desc: 'All transactions for a person across agreements',
    },
    {
      id: 'agreements',
      label: 'By Agreement',
      icon: <DollarSign className="h-4 w-4" />,
      desc: 'Drill into a single agreement ledger',
    },
    {
      id: 'vendors',
      label: 'Vendors',
      icon: <Truck className="h-4 w-4" />,
      desc: 'Payments made to external car suppliers',
    },
    {
      id: 'summary',
      label: 'Financial Summary',
      icon: <BarChart2 className="h-4 w-4" />,
      desc: 'Daily / monthly / yearly totals',
    },
  ]

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-green-500" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {t('ledger.title', 'Ledger & Payments')}
            </h1>
            <p className="text-sm text-gray-500">
              {t('ledger.subtitle', 'Financial audit trail — append-only, never modified')}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          icon={<Download className="h-4 w-4" />}
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? t('common.exporting', 'Exporting...') : t('common.export', 'Export CSV')}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'customers' && <CustomersTab />}
      {activeTab === 'agreements' && <AgreementsTab />}
      {activeTab === 'vendors' && <VendorsTab />}
      {activeTab === 'summary' && <SummaryTab />}
    </div>
  )
}
