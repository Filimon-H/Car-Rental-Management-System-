import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2, Users, AlertTriangle, X } from 'lucide-react'
import { collateralsService, CollateralPerson } from '@/services/collaterals'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PageToolbar } from '@/components/ui/PageToolbar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/use-toast'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/apiClient'

const PAGE_SIZE = 20

export default function CollateralsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<CollateralPerson | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['collaterals', page, debouncedSearch],
    queryFn: () => collateralsService.list({ page, search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: collateralsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaterals'] })
      setDeleteConfirm(null)
    },
    onError: (err: unknown) => {
      const detail = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: t('collaterals.deleteFailed', 'Failed to delete collateral person'),
        description: detail,
      })
    },
  })

  const personName = (person: CollateralPerson) => `${person.first_name} ${person.last_name}`

  const columns: Column<CollateralPerson>[] = [
    {
      key: 'person',
      header: t('collaterals.columns.person', 'Collateral Person'),
      cell: (collateral) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/15">
            <Users className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          </div>
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {personName(collateral)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {collateral.email || t('collaterals.noEmail', 'No email')}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('collaterals.columns.phone', 'Phone'),
      className: 'whitespace-nowrap',
      cell: (collateral) => collateral.phone_primary,
    },
    {
      key: 'id',
      header: t('collaterals.columns.id', 'ID'),
      className: 'whitespace-nowrap',
      cell: (collateral) => (
        <>
          <span className="text-slate-500 dark:text-slate-400">{collateral.id_type}:</span>{' '}
          {collateral.id_number}
        </>
      ),
    },
    {
      key: 'relationship',
      header: t('collaterals.columns.relationship', 'Relationship'),
      cell: (collateral) =>
        collateral.relationship_to_customer || t('common.notAvailable', 'N/A'),
    },
    {
      key: 'customer',
      header: t('collaterals.columns.customer', 'Customer'),
      className: 'whitespace-nowrap',
      cell: (collateral) =>
        collateral.customer ? (
          `${collateral.customer.first_name} ${collateral.customer.last_name}`
        ) : (
          <span className="text-slate-400 dark:text-slate-500">
            {t('common.unknown', 'Unknown')}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('collaterals.columns.status', 'Status'),
      cell: (collateral) => (
        <StatusBadge
          status={collateral.is_active ? 'active' : 'inactive'}
          label={
            collateral.is_active ? t('common.active', 'Active') : t('common.inactive', 'Inactive')
          }
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions', 'Actions')}</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (collateral) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/collaterals/${collateral.id}/edit`)
            }}
            aria-label={t('collaterals.editAria', 'Edit {{name}}', {
              name: personName(collateral),
            })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteConfirm(collateral)
            }}
            aria-label={t('collaterals.deleteAria', 'Delete {{name}}', {
              name: personName(collateral),
            })}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <PageToolbar
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/collaterals/new')}>
            {t('collaterals.add', 'Add Collateral Person')}
          </Button>
        }
      >
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          label={t('collaterals.searchLabel', 'Search collateral persons')}
          placeholder={t('collaterals.searchPlaceholder', 'Search collateral persons...')}
          className="w-full sm:w-72"
        />
      </PageToolbar>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(collateral) => collateral.id}
        isLoading={isLoading}
        error={error}
        onRowClick={(collateral) => navigate(`/collaterals/${collateral.id}`)}
        caption={t('collaterals.title', 'Collateral Persons')}
        emptyTitle={t('collaterals.empty', 'No collateral persons found')}
        emptyMessage={
          debouncedSearch
            ? t('collaterals.emptyFiltered', 'Try a different search term.')
            : t('collaterals.emptyInitial', 'Add a collateral person to get started.')
        }
        errorMessage={t('collaterals.loadError', 'Error loading collateral persons')}
      />

      {data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={setPage}
          label={t('collaterals.pagination', 'Collateral persons pagination')}
        />
      )}

      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-collateral-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-night-surface dark:ring-1 dark:ring-night-border">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3
                  id="delete-collateral-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t('collaterals.deleteTitle', 'Delete Collateral Person')}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('collaterals.deleteConfirm', 'Are you sure you want to permanently delete')}{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {personName(deleteConfirm)}
                  </strong>
                  ? {t('common.cannotBeUndone', 'This action cannot be undone.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                aria-label={t('common.close', 'Close')}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t('common.deleting', 'Deleting...')
                  : t('common.delete', 'Delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
