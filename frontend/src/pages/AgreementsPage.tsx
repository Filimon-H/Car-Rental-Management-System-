import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { agreementsService } from '@/services/agreements'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar, FilterTabs } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDate as sharedFormatDate } from '../lib/utils'

const PAGE_SIZE = 20

interface AgreementRow {
  id: number
  agreement_number: string
  customer_name: string
  pickup_datetime: string
  expected_return_datetime: string
  agreed_daily_rate: number
  status: string
}

export default function AgreementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm)

  const statusTabs = [
    { value: '', label: t('agreements.status.all', 'All') },
    { value: 'booking_requested', label: t('agreements.status.bookingRequested', 'Booking Requests') },
    { value: 'active', label: t('agreements.status.active', 'Active') },
    { value: 'draft', label: t('agreements.status.draft', 'Draft') },
    { value: 'overdue', label: t('agreements.status.overdue', 'Overdue') },
    { value: 'closed', label: t('agreements.status.closed', 'Closed') },
    { value: 'cancelled', label: t('agreements.status.cancelled', 'Cancelled') },
  ]

  // A new search or filter invalidates the current page number.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['agreements', page, statusFilter, debouncedSearch],
    queryFn: () =>
      agreementsService.list({
        page,
        page_size: PAGE_SIZE,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      }),
    // Keeps the previous page visible while the next one loads, so paging and
    // typing don't flash the table back to skeletons.
    placeholderData: keepPreviousData,
  })

  const formatDate = (dateStr: string) =>
    sharedFormatDate(dateStr, { year: 'numeric', month: 'short', day: 'numeric' })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const columns: Column<AgreementRow>[] = [
    {
      key: 'number',
      header: t('agreements.columns.number', 'Agreement #'),
      className: 'whitespace-nowrap font-semibold text-slate-800 dark:text-slate-100',
      cell: (row) => row.agreement_number,
    },
    {
      key: 'customer',
      header: t('agreements.columns.customer', 'Customer'),
      className: 'whitespace-nowrap',
      cell: (row) => row.customer_name,
    },
    {
      key: 'dates',
      header: t('agreements.columns.dates', 'Dates'),
      className: 'whitespace-nowrap text-slate-500 dark:text-slate-400',
      cell: (row) => (
        <>
          {formatDate(row.pickup_datetime)}
          <span className="mx-1 text-slate-300 dark:text-slate-600" aria-hidden="true">
            →
          </span>
          {formatDate(row.expected_return_datetime)}
        </>
      ),
    },
    {
      key: 'rate',
      header: t('agreements.columns.dailyRate', 'Daily Rate'),
      className: 'whitespace-nowrap font-medium',
      cell: (row) => formatCurrency(row.agreed_daily_rate),
    },
    {
      key: 'status',
      header: t('agreements.columns.status', 'Status'),
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'action',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/agreements/${row.id}`)
          }}
          className="rounded text-xs font-semibold text-primary transition-colors hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-orange-brand"
        >
          {t('common.view', 'View')} →
        </button>
      ),
    },
  ]

  return (
    <div className="p-6 page-fade">
      <PageToolbar
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/agreements/new')}>
            {t('agreements.createNew', 'New Agreement')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('agreements.searchLabel', 'Search agreements')}
          placeholder={t('agreements.searchPlaceholder', 'Search agreement or customer...')}
          className="w-full sm:w-72"
        />
      </PageToolbar>

      <div className="mb-4">
        <FilterTabs
          tabs={statusTabs}
          value={statusFilter}
          onChange={setStatusFilter}
          label={t('agreements.filterByStatus', 'Filter by status')}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items as AgreementRow[] | undefined}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(row) => navigate(`/agreements/${row.id}`)}
        caption={t('agreements.title', 'Agreements')}
        emptyTitle={t('agreements.emptyTitle', 'No agreements found')}
        emptyMessage={
          debouncedSearch || statusFilter
            ? t('agreements.emptyFiltered', 'Try a different search term or status filter.')
            : t('agreements.emptyInitial', 'Create your first rental agreement to get started.')
        }
        errorMessage={t('agreements.loadError', 'Error loading agreements')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('agreements.pagination', 'Agreements pagination')}
        />
      )}
    </div>
  )
}
