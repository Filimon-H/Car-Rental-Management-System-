import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DollarSign, TrendingUp, TrendingDown, Search, Filter } from 'lucide-react'
import { agreementsService, LedgerEntry } from '@/services/agreements'

export default function LedgerPage() {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAgreement, setSelectedAgreement] = useState<number | null>(null)

  // Fetch agreements for selection
  const { data: agreements } = useQuery({
    queryKey: ['agreements'],
    queryFn: () => agreementsService.list({ page_size: 100 }),
  })

  // Fetch ledger entries for selected agreement
  const { data: ledgerEntries, isLoading } = useQuery({
    queryKey: ['ledger', selectedAgreement],
    queryFn: () => agreementsService.getLedger(selectedAgreement!),
    enabled: !!selectedAgreement,
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculate running balance
  const entriesWithBalance = ledgerEntries?.reduce((acc, entry, index) => {
    const prevBalance = index > 0 ? acc[index - 1].runningBalance : 0
    const runningBalance = prevBalance + entry.amount
    return [...acc, { ...entry, runningBalance }]
  }, [] as (LedgerEntry & { runningBalance: number })[])

  // Filter agreements by search term
  const filteredAgreements = agreements?.items.filter(
    (a) =>
      a.agreement_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate totals
  const totalCharges = entriesWithBalance?.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0) || 0
  const totalPayments = entriesWithBalance?.filter(e => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0) || 0
  const currentBalance = entriesWithBalance?.[entriesWithBalance.length - 1]?.runningBalance || 0

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <DollarSign className="h-8 w-8 text-green-500" />
        <h1 className="text-2xl font-bold text-gray-800">
          {t('ledger.title', 'Ledger & Payments')}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Agreement Selector */}
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
                />
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {filteredAgreements?.map((agreement) => (
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

        {/* Ledger Content */}
        <div className="lg:col-span-3">
          {!selectedAgreement ? (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
              <div className="text-center text-gray-500">
                <Filter className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2">Select an agreement to view ledger</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="flex items-center gap-2 text-red-500">
                    <TrendingUp className="h-5 w-5" />
                    <span className="text-sm font-medium">Total Charges</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-800">
                    {formatCurrency(totalCharges)}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="flex items-center gap-2 text-green-500">
                    <TrendingDown className="h-5 w-5" />
                    <span className="text-sm font-medium">Total Payments</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-800">
                    {formatCurrency(totalPayments)}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="flex items-center gap-2 text-blue-500">
                    <DollarSign className="h-5 w-5" />
                    <span className="text-sm font-medium">Balance Due</span>
                  </div>
                  <div className={`mt-2 text-2xl font-bold ${currentBalance > 0 ? 'text-red-600' : currentBalance < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                    {formatCurrency(currentBalance)}
                  </div>
                </div>
              </div>

              {/* Ledger Table */}
              <div className="rounded-lg bg-white shadow">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold text-gray-700">Ledger Entries</h2>
                </div>
                {isLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Description
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {entriesWithBalance?.map((entry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {formatDate(entry.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              entry.entry_type === 'payment' ? 'bg-green-100 text-green-800' :
                              entry.entry_type === 'charge' ? 'bg-red-100 text-red-800' :
                              entry.entry_type === 'adjustment' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {entry.entry_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {entry.description}
                            {entry.payment_method && (
                              <span className="ml-2 text-xs text-gray-400">
                                ({entry.payment_method})
                              </span>
                            )}
                          </td>
                          <td className={`whitespace-nowrap px-6 py-4 text-right text-sm font-medium ${
                            entry.amount > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {entry.amount > 0 ? '+' : ''}{formatCurrency(entry.amount)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                            {formatCurrency(entry.runningBalance)}
                          </td>
                        </tr>
                      ))}
                      {(!entriesWithBalance || entriesWithBalance.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                            No ledger entries found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
