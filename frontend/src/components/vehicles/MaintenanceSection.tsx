import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field, SelectField, TextareaField } from '@/components/ui/Field'
import { getErrorMessage, getFieldErrors } from '@/services/apiClient'
import { useAuthStore } from '@/services/auth'
import {
  dateInputToInstant,
  MAINTENANCE_TYPES,
  maintenanceService,
  type MaintenanceRecord,
  type MaintenanceType,
} from '@/services/maintenance'
import { formatDate, toNumber } from '@/lib/utils'

/**
 * Service history on the vehicle page, and a way to log new work.
 *
 * The backend recorded maintenance and computed what was due, but the admin
 * app never called it: there was nowhere to log an oil change or see that a
 * car was past its service. Logging and deleting need MANAGE_VEHICLES on the
 * server (admin and fleet); the buttons are hidden for other roles so they
 * are not offered and then refused.
 */
export function MaintenanceSection({
  vehicleId,
  currentMileage,
}: {
  vehicleId: number
  currentMileage?: number | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canManage = useAuthStore((s) => s.hasRole('admin', 'fleet'))
  const [logging, setLogging] = useState(false)
  const [deleting, setDeleting] = useState<MaintenanceRecord | null>(null)

  const { data: records = [], isLoading, isError } = useQuery({
    queryKey: ['maintenance', vehicleId],
    queryFn: () => maintenanceService.listForVehicle(vehicleId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance', vehicleId] })
    queryClient.invalidateQueries({ queryKey: ['maintenance-due'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => maintenanceService.remove(id),
    onSuccess: () => {
      setDeleting(null)
      invalidate()
    },
  })

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Wrench className="h-5 w-5 text-gray-500" aria-hidden="true" />
          {t('maintenance.title')}
        </h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('maintenance.logService')}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600">{t('maintenance.loadFailed')}</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-500">{t('maintenance.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-gray-500">
                <th className="py-2 pr-4">{t('maintenance.date')}</th>
                <th className="py-2 pr-4">{t('maintenance.type')}</th>
                <th className="py-2 pr-4">{t('maintenance.description')}</th>
                <th className="py-2 pr-4 text-right">{t('maintenance.odometer')}</th>
                <th className="py-2 pr-4 text-right">{t('maintenance.cost')}</th>
                <th className="py-2 pr-4">{t('maintenance.nextDue')}</th>
                {canManage && <th className="py-2"><span className="sr-only">{t('common.actions')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.performed_at)}</td>
                  <td className="py-2 pr-4">{t(`maintenance.types.${r.service_type}`)}</td>
                  <td className="py-2 pr-4">
                    {r.description}
                    {r.provider && <span className="block text-xs text-gray-500">{r.provider}</span>}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {r.odometer != null ? `${r.odometer.toLocaleString()} km` : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">
                    {toNumber(r.cost).toLocaleString()} ETB
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {[
                      r.next_due_date ? formatDate(r.next_due_date) : null,
                      r.next_due_mileage != null ? `${r.next_due_mileage.toLocaleString()} km` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        aria-label={t('maintenance.deleteRecord', { date: formatDate(r.performed_at) })}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logging && (
        <LogServiceModal
          vehicleId={vehicleId}
          currentMileage={currentMileage}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false)
            invalidate()
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={t('maintenance.deleteTitle')}
          message={t('maintenance.deleteMessage', {
            type: t(`maintenance.types.${deleting.service_type}`),
            date: formatDate(deleting.performed_at),
          })}
          confirmLabel={t('maintenance.deleteConfirm')}
          destructive
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function todayInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function LogServiceModal({
  vehicleId,
  currentMileage,
  onClose,
  onSaved,
}: {
  vehicleId: number
  currentMileage?: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    service_type: 'routine_service' as MaintenanceType,
    performed_at: todayInput(),
    description: '',
    odometer: currentMileage != null ? String(currentMileage) : '',
    cost: '',
    provider: '',
    notes: '',
    next_due_date: '',
    next_due_mileage: '',
  })
  const [localError, setLocalError] = useState('')

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () =>
      maintenanceService.create(vehicleId, {
        service_type: form.service_type,
        performed_at: dateInputToInstant(form.performed_at),
        description: form.description.trim(),
        odometer: form.odometer ? Number(form.odometer) : null,
        cost: form.cost ? Number(form.cost) : 0,
        provider: form.provider.trim() || null,
        notes: form.notes.trim() || null,
        next_due_date: form.next_due_date ? dateInputToInstant(form.next_due_date) : null,
        next_due_mileage: form.next_due_mileage ? Number(form.next_due_mileage) : null,
      }),
    onSuccess: onSaved,
  })

  const fieldErrors = getFieldErrors(mutation.error)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim()) {
      setLocalError(t('maintenance.descriptionRequired'))
      return
    }
    if (form.performed_at > todayInput()) {
      setLocalError(t('maintenance.notInFuture'))
      return
    }
    if (form.next_due_date && form.next_due_date <= form.performed_at) {
      setLocalError(t('maintenance.nextDueAfter'))
      return
    }
    setLocalError('')
    mutation.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-service-title"
    >
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 id="log-service-title" className="mb-4 text-lg font-bold text-gray-900">
          {t('maintenance.logService')}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label={t('maintenance.type')}
            value={form.service_type}
            onChange={set('service_type')}
            error={fieldErrors.service_type}
          >
            {MAINTENANCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`maintenance.types.${type}`)}
              </option>
            ))}
          </SelectField>
          <Field
            label={t('maintenance.date')}
            type="date"
            required
            max={todayInput()}
            value={form.performed_at}
            onChange={set('performed_at')}
            error={fieldErrors.performed_at}
          />
          <div className="sm:col-span-2">
            <Field
              label={t('maintenance.description')}
              required
              maxLength={255}
              value={form.description}
              onChange={set('description')}
              error={fieldErrors.description}
            />
          </div>
          <Field
            label={t('maintenance.odometer')}
            type="number"
            min={0}
            inputMode="numeric"
            value={form.odometer}
            onChange={set('odometer')}
            error={fieldErrors.odometer}
          />
          <Field
            label={t('maintenance.costEtb')}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.cost}
            onChange={set('cost')}
            error={fieldErrors.cost}
          />
          <div className="sm:col-span-2">
            <Field
              label={t('maintenance.provider')}
              maxLength={200}
              value={form.provider}
              onChange={set('provider')}
              error={fieldErrors.provider}
            />
          </div>
          <Field
            label={t('maintenance.nextDueDate')}
            type="date"
            min={form.performed_at}
            value={form.next_due_date}
            onChange={set('next_due_date')}
            error={fieldErrors.next_due_date}
          />
          <Field
            label={t('maintenance.nextDueMileage')}
            type="number"
            min={0}
            inputMode="numeric"
            value={form.next_due_mileage}
            onChange={set('next_due_mileage')}
            error={fieldErrors.next_due_mileage}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label={t('maintenance.notes')}
              rows={2}
              value={form.notes}
              onChange={set('notes')}
            />
          </div>
        </div>

        {(localError || (mutation.isError && !Object.keys(fieldErrors).length)) && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {localError || getErrorMessage(mutation.error)}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {mutation.isPending ? t('common.loading') : t('maintenance.save')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default MaintenanceSection
