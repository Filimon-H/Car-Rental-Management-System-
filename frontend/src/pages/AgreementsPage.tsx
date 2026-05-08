import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { agreementsService } from '@/services/agreements'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const statusMap: Record<string, { dot: string; text: string; bg: string }> = {
  draft: { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' },
  active: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
  closed: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  overdue: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  cancelled: { dot: 'bg-slate-300', text: 'text-slate-400', bg: 'bg-slate-50' },
}

function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] || statusMap.draft
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function AgreementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['agreements', page, statusFilter],
    queryFn: () =>
      agreementsService.list({
        page,
        page_size: 20,
        status: statusFilter || undefined,
      }),
  })

  const filteredItems = data?.items.filter(
    (item) =>
      item.agreement_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const handleTabChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  return (
    <div className="p-6 page-fade">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search agreement or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => navigate('/agreements/new')}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {t('agreements.createNew', 'New Agreement')}
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === tab.value
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center text-sm text-red-500">
            Error loading agreements
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Agreement #
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Customer
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Dates
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Daily Rate
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems?.map((agreement) => (
                <tr
                  key={agreement.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => navigate(`/agreements/${agreement.id}`)}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm font-semibold text-slate-800">
                    {agreement.agreement_number}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">
                    {agreement.customer_name}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-500">
                    {formatDate(agreement.pickup_datetime)}
                    <span className="mx-1 text-slate-300">→</span>
                    {formatDate(agreement.expected_return_datetime)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-slate-700">
                    {formatCurrency(agreement.agreed_daily_rate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <StatusBadge status={agreement.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/agreements/${agreement.id}`)
                      }}
                      className="text-xs font-semibold text-primary transition-colors hover:text-primary-700"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
              {filteredItems?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-400">
                    No agreements found
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
    </div>
  )
}
