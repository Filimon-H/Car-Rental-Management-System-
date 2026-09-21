import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Heart } from 'lucide-react'
import { agreementsService } from '@/services/agreements'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const PAGE_SIZE = 20

interface WeddingRow {
  id: number
  agreement_number: string
  customer_name: string
  pickup_datetime: string
  expected_return_datetime: string
  agreed_daily_rate: number
  status: string
}

export default function WeddingAgreementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['weddingAgreements', page, statusFilter, debouncedSearch],
    queryFn: () =>
      agreementsService.list({
        page,
        page_size: PAGE_SIZE,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        // Filtered server-side; filtering the page client-side made the totals and
        // paging count standard agreements too.
        agreement_type: 'wedding',
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

  const columns: Column<WeddingRow>[] = [
    {
      key: 'number',
      header: t('agreements.columns.number', 'Agreement #'),
      className: 'whitespace-nowrap font-medium text-slate-900 dark:text-slate-100',
      cell: (agreement) => (
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 flex-shrink-0 text-pink-400" aria-hidden="true" />
          {agreement.agreement_number}
        </div>
      ),
    },
    {
      key: 'customer',
      header: t('agreements.columns.customer', 'Customer'),
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
      key: 'total',
      header: t('agreements.columns.total', 'Total'),
      className: 'whitespace-nowrap',
      cell: (agreement) => formatCurrency(agreement.agreed_daily_rate),
    },
    {
      key: 'status',
      header: t('agreements.columns.status', 'Status'),
      cell: (agreement) => <StatusBadge status={agreement.status} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (agreement) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/agreements/${agreement.id}`)
          }}
          className="rounded text-sm font-semibold text-pink-600 transition-colors hover:text-pink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-pink-400"
        >
          {t('common.view', 'View')}
        </button>
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Heart className="h-8 w-8 text-pink-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {t('agreements.wedding.title', 'Wedding Agreements')}
        </h1>
      </div>

      <PageToolbar
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/agreements/wedding/new')}
            className="bg-pink-500 hover:bg-pink-600 dark:bg-pink-500 dark:hover:bg-pink-600"
          >
            {t('agreements.wedding.createNew', 'New Wedding Agreement')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('agreements.wedding.searchLabel', 'Search wedding agreements')}
          placeholder={t('agreements.searchPlaceholder', 'Search agreement or customer...')}
          className="w-full sm:w-72"
        />
        <div>
          <label htmlFor="wedding-status-filter" className="sr-only">
            {t('agreements.filterByStatus', 'Filter by status')}
          </label>
          <select
            id="wedding-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 dark:border-night-border dark:bg-night-raised dark:text-slate-200"
          >
            <option value="">{t('agreements.status.all', 'All Status')}</option>
            <option value="active">{t('agreements.status.active', 'Active')}</option>
            <option value="draft">{t('agreements.status.draft', 'Draft')}</option>
            <option value="closed">{t('agreements.status.closed', 'Closed')}</option>
            <option value="cancelled">{t('agreements.status.cancelled', 'Cancelled')}</option>
          </select>
        </div>
      </PageToolbar>

      <DataTable
        columns={columns}
        rows={data?.items as WeddingRow[] | undefined}
        rowKey={(agreement) => agreement.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(agreement) => navigate(`/agreements/${agreement.id}`)}
        caption={t('agreements.wedding.title', 'Wedding Agreements')}
        emptyTitle={t('agreements.wedding.empty', 'No wedding agreements found')}
        emptyMessage={
          debouncedSearch || statusFilter
            ? t('agreements.emptyFiltered', 'Try a different search term or status filter.')
            : t('agreements.wedding.emptyInitial', 'Create your first wedding agreement to get started.')
        }
        errorMessage={t('agreements.loadError', 'Error loading agreements')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('agreements.wedding.pagination', 'Wedding agreements pagination')}
        />
      )}
    </div>
  )
}
