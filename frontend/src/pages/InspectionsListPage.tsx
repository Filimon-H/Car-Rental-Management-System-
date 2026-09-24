import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList } from 'lucide-react'
import { inspectionsService } from '@/services/inspections'
import { StatusBadge } from '@/components/ui/StatusBadge'

/**
 * Inspection history.
 *
 * The Inspections route previously showed only templates, so a completed
 * inspection could not be found again — the only way back to one was to type
 * its id into the address bar.
 */
export default function InspectionsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['inspections', status, page],
    queryFn: () =>
      inspectionsService.list({
        status: status || undefined,
        page,
        page_size: 20,
      }),
  })

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="inspection-status" className="sr-only">
          {t('inspection.allStatuses')}
        </label>
        <select
          id="inspection-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('inspection.allStatuses')}</option>
          <option value="draft">{t('agreements.status.draft')}</option>
          <option value="completed">{t('inspection.complete')}</option>
          <option value="signed">{t('inspection.sign')}</option>
        </select>

        <button
          type="button"
          onClick={() => navigate('/inspections/new')}
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + {t('inspection.newInspection')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="[contain:paint] overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">{t('ledger.dateTime')}</th>
                <th className="px-4 py-3">{t('sections.type')}</th>
                <th className="px-4 py-3">{t('vehicleDetail.plate')}</th>
                <th className="px-4 py-3">{t('nav.agreements')}</th>
                <th className="px-4 py-3">{t('inspection.inspector')}</th>
                <th className="px-4 py-3">{t('inspection.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((inspection) => (
                <tr
                  key={inspection.id}
                  onClick={() => navigate(`/inspections/${inspection.id}`)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3">{formatDate(inspection.inspection_datetime)}</td>
                  <td className="px-4 py-3 capitalize">{inspection.inspection_type}</td>
                  <td className="px-4 py-3">{inspection.vehicle_plate ?? '—'}</td>
                  <td className="px-4 py-3">
                    {inspection.agreement_id ? (
                      <Link
                        to={`/agreements/${inspection.agreement_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {inspection.agreement_number ?? `#${inspection.agreement_id}`}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">{inspection.inspector_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inspection.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.total > data.page_size && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-gray-500">
                {data.total} {t('inspection.historyTab').toLowerCase()}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border px-3 py-1 disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <button
                  type="button"
                  disabled={page * data.page_size >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border px-3 py-1 disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg bg-white shadow">
          <div className="text-center text-gray-500">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2">{t('inspection.noInspections')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
