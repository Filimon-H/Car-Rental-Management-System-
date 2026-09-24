import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart2, Download } from 'lucide-react'
import apiClient, { getErrorMessage } from '@/services/apiClient'

/**
 * Report downloads.
 *
 * The four report endpoints existed with no way to reach them; the only
 * export in the UI was on the Ledger page. Access is gated to admin and
 * accountant by the route guard, matching the VIEW_REPORTS permission the
 * API already enforces.
 */
export default function ReportsPage() {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`

  const [start, setStart] = useState(monthStart)
  const [end, setEnd] = useState(today)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rangeValid = Boolean(start && end && start <= end)

  const download = async (key: string, path: string) => {
    setError(null)
    setBusy(key)
    try {
      const blob = await apiClient.getBlob(path, { start, end })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${key}_${start}_${end}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(getErrorMessage(err, t('reports.downloadFailed')))
    } finally {
      setBusy(null)
    }
  }

  const reports = [
    { key: 'revenue', path: '/reports/revenue.csv', label: t('reports.revenue') },
    {
      key: 'vendor_payables',
      path: '/reports/vendor-payables.csv',
      label: t('reports.vendorPayables'),
    },
    {
      key: 'fleet_utilization',
      path: '/reports/fleet-utilization.csv',
      label: t('reports.fleetUtilization'),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <BarChart2 className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">{t('reports.title')}</h1>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg border bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 md:max-w-md">
          <div>
            <label htmlFor="report-start" className="mb-1 block text-sm font-medium text-gray-700">
              {t('reports.startDate')}
            </label>
            <input
              id="report-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="report-end" className="mb-1 block text-sm font-medium text-gray-700">
              {t('reports.endDate')}
            </label>
            <input
              id="report-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {!rangeValid && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {t('reports.rangeInvalid')}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {reports.map((report) => (
          <div key={report.key} className="rounded-lg border bg-white p-4">
            <h2 className="mb-1 font-semibold text-gray-900">{report.label}</h2>
            <p className="mb-4 text-sm text-gray-500">{t('reports.csvForRange')}</p>
            <button
              type="button"
              onClick={() => download(report.key, report.path)}
              disabled={!rangeValid || busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {busy === report.key ? t('common.loading') : t('common.export')}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-gray-500">{t('reports.ledgerCsvHint')}</p>
    </div>
  )
}
