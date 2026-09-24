import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Car, ClipboardList } from 'lucide-react'
import { inspectionsService } from '@/services/inspections'
import { getErrorMessage } from '@/services/apiClient'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { documentsService } from '@/services/documents'

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const inspectionId = id && /^\d+$/.test(id) ? Number.parseInt(id, 10) : null
  const [pageError, setPageError] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [signing, setSigning] = useState(false)
  const [customerName, setCustomerName] = useState('')

  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', inspectionId],
    queryFn: () => inspectionsService.getById(inspectionId as number),
    enabled: inspectionId !== null,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] })
    queryClient.invalidateQueries({ queryKey: ['inspections'] })
  }

  const completeMutation = useMutation({
    mutationFn: () => inspectionsService.complete(inspectionId as number),
    onSuccess: () => {
      refresh()
      setConfirmComplete(false)
    },
    onError: (error: unknown) =>
      setPageError(getErrorMessage(error, t('inspection.completeFailed'))),
  })

  const signMutation = useMutation({
    mutationFn: () => inspectionsService.sign(inspectionId as number, customerName.trim()),
    onSuccess: () => {
      refresh()
      setSigning(false)
      setCustomerName('')
    },
    onError: (error: unknown) => setPageError(getErrorMessage(error, t('inspection.signFailed'))),
  })

  const reportMutation = useMutation({
    mutationFn: () => documentsService.generateInspectionReport(inspectionId as number),
    onError: (error: unknown) =>
      setPageError(getErrorMessage(error, t('inspection.reportFailed'))),
  })

  if (inspectionId === null) {
    return <div className="p-6 text-center text-red-500">{t('inspection.invalidId')}</div>
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!inspection) {
    return <div className="p-6 text-center text-red-500">{t('inspection.notFound')}</div>
  }

  const isLocked = inspection.status === 'completed' || inspection.status === 'signed'

  // checklist_results is keyed by the template item id; the label is not
  // stored alongside it, so fall back to humanising the key.
  const checklistEntries = Object.entries(
    (inspection.checklist_results ?? {}) as Record<
      string,
      { status?: string; notes?: string; photos?: string[] }
    >
  )
  const humanize = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  return (
    <div className="p-6">
      {pageError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
          {pageError}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/inspections')}
            className="rounded-lg p-2 hover:bg-gray-100"
            title={t('common.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('inspection.title', 'Inspection')} #{inspection.id}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <span className="capitalize">{inspection.inspection_type}</span>
              <span>·</span>
              <StatusBadge status={inspection.status} />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('inspection.generateReport')}
          </button>
          {!isLocked && (
            <button
              type="button"
              onClick={() => setConfirmComplete(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('inspection.complete')}
            </button>
          )}
          {inspection.status === 'completed' && (
            <button
              type="button"
              onClick={() => setSigning(true)}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              {t('inspection.sign')}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Car className="h-4 w-4" /> {t('sections.vehicleInformation')}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label={t('vehicleDetail.mileage')} value={inspection.mileage ?? '—'} />
            <Row
              label={t('inspection.fuelLevel')}
              value={inspection.fuel_level === null ? '—' : `${inspection.fuel_level}%`}
            />
            <Row
              label={t('inspection.conditionRating')}
              value={inspection.condition_rating ?? '—'}
            />
          </dl>
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <ClipboardList className="h-4 w-4" /> {t('common.details')}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label={t('ledger.dateTime')} value={formatDate(inspection.inspection_datetime)} />
            <Row label={t('inspection.inspector')} value={inspection.inspector_name ?? '—'} />
            <Row
              label={t('nav.customers')}
              value={inspection.agreement_customer_name ?? inspection.customer_name ?? '—'}
            />
            <Row label={t('inspection.template')} value={inspection.template_name ?? '—'} />
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('nav.agreements')}</dt>
              <dd className="font-medium text-gray-900">
                {inspection.agreement_id ? (
                  <Link
                    to={`/agreements/${inspection.agreement_id}`}
                    className="text-primary hover:underline"
                  >
                    {inspection.agreement_number ?? `#${inspection.agreement_id}`}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <Row label={t('inspection.completedAt')} value={formatDate(inspection.completed_at)} />
          </dl>
        </section>

        <section className="rounded-lg border bg-white p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            {t('inspection.checklistResults')}
          </h2>
          {checklistEntries.length === 0 ? (
            <p className="text-sm text-gray-500">{t('inspection.noChecklistResults')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {checklistEntries.map(([key, result]) => (
                <li key={key} className="flex items-start justify-between gap-4 py-2">
                  <div>
                    <span className="font-medium text-gray-900">{humanize(key)}</span>
                    {result.notes && <p className="mt-0.5 text-gray-600">{result.notes}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      result.status === 'ok'
                        ? 'bg-green-100 text-green-700'
                        : result.status === 'damage'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {result.status === 'ok'
                      ? t('inspection.statusOk')
                      : result.status === 'damage'
                        ? t('inspection.statusDamage')
                        : t('inspection.statusNa')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            {t('inspection.damageRecords')}
          </h2>
          {inspection.damage_records.length === 0 ? (
            <p className="text-sm text-gray-500">{t('inspection.noDamageRecorded')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {inspection.damage_records.map((damage, index) => (
                <li key={index} className="rounded border border-gray-200 px-3 py-2">
                  <span className="font-medium">{damage.area ?? '—'}</span>
                  {damage.severity && (
                    <span className="ml-2 text-gray-500">({damage.severity})</span>
                  )}
                  {damage.description && (
                    <p className="mt-0.5 text-gray-600">{damage.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {inspection.notes && (
          <section className="rounded-lg border bg-white p-4 md:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">{t('sections.notes', 'Notes')}</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{inspection.notes}</p>
          </section>
        )}
      </div>

      {confirmComplete && (
        <ConfirmModal
          title={t('inspection.confirmCompleteTitle')}
          message={t('inspection.confirmCompleteBody')}
          confirmLabel={t('inspection.complete')}
          isLoading={completeMutation.isPending}
          onClose={() => setConfirmComplete(false)}
          onConfirm={() => completeMutation.mutate()}
        />
      )}

      {signing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              signMutation.mutate()
            }}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-lg font-bold text-gray-900">{t('inspection.sign')}</h2>
            <label
              htmlFor="inspection-customer-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t('customerDetail.fullName', 'Customer name')}
            </label>
            <input
              id="inspection-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSigning(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={signMutation.isPending || !customerName.trim()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {signMutation.isPending ? t('common.loading') : t('inspection.sign')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  )
}
