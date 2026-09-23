import { useQuery } from '@tanstack/react-query'
import { agreementsService } from '@/services/agreements'
import {
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  AlertCircle,
  Shield,
  RefreshCw,
  Banknote,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toNumber } from '@/lib/utils'

interface TypeMeta {
  label: string
  badge: string
  icon: React.ReactNode
}

const TYPE_META: Record<string, TypeMeta> = {
  charge: {
    label: 'entryType.rentalCharge',
    badge: 'bg-red-100 text-red-800 border border-red-200',
    icon: <ArrowUpCircle className="h-3.5 w-3.5" />,
  },
  deposit: {
    label: 'entryType.depositReceived',
    badge: 'bg-blue-100 text-blue-800 border border-blue-200',
    icon: <Shield className="h-3.5 w-3.5" />,
  },
  deposit_applied: {
    label: 'entryType.depositApplied',
    badge: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    icon: <Shield className="h-3.5 w-3.5" />,
  },
  deposit_return: {
    label: 'entryType.depositReturn',
    badge: 'bg-teal-100 text-teal-800 border border-teal-200',
    icon: <RefreshCw className="h-3.5 w-3.5" />,
  },
  payment: {
    label: 'entryType.payment',
    badge: 'bg-green-100 text-green-800 border border-green-200',
    icon: <ArrowDownCircle className="h-3.5 w-3.5" />,
  },
  adjustment: {
    label: 'entryType.adjustment',
    badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    icon: <RefreshCw className="h-3.5 w-3.5" />,
  },
  reversal: {
    label: 'entryType.reversal',
    badge: 'bg-amber-100 text-amber-800 border border-amber-200',
    icon: <RotateCcw className="h-3.5 w-3.5" />,
  },
  damage_charge: {
    label: 'entryType.damageCharge',
    badge: 'bg-red-200 text-red-900 border border-red-300',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  late_fee: {
    label: 'entryType.lateFee',
    badge: 'bg-orange-100 text-orange-800 border border-orange-200',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  telebirr: 'TeleBirr',
  credit_card: 'Credit Card',
  cheque: 'Cheque',
}

interface LedgerTableProps {
  agreementId: number
  /** Omit to render the table read-only, as the customer ledger does. */
  onReverse?: (entry: { id: number; description: string }) => void
}

export default function LedgerTable({ agreementId, onReverse }: LedgerTableProps) {
  const { t } = useTranslation()
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['ledger', agreementId],
    queryFn: () => agreementsService.getLedger(agreementId),
  })

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(
      Math.abs(toNumber(n))
    )

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const fmtTime = (s: string) =>
    new Date(s).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        Failed to load ledger entries.
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-gray-500">
        <Banknote className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No ledger entries yet</p>
      </div>
    )
  }

  // Amounts arrive as Decimal strings, so every one of these has to be
  // coerced — `running += entry.amount` concatenated and rendered "ETB NaN".
  const DEPOSIT_TYPES = ['deposit', 'deposit_return']

  // A received deposit is held, not revenue: it does not reduce what the
  // customer owes until it is applied. Excluding it here keeps this tab in
  // step with the header tiles, which already treated it that way.
  const affectsBalance = (entryType: string) => !DEPOSIT_TYPES.includes(entryType)

  let running = 0
  const rows = entries.map((entry, i) => {
    if (affectsBalance(entry.entry_type)) {
      running += toNumber(entry.amount)
    }
    return { ...entry, seq: i + 1, runningBalance: running }
  })

  // Summary totals
  const totalDebits = entries
    .filter((e) => toNumber(e.amount) > 0)
    .reduce((s, e) => s + toNumber(e.amount), 0)
  // Payments only — summing every credit counted the deposit as money paid.
  const totalCredits = entries
    .filter((e) => e.entry_type === 'payment')
    .reduce((s, e) => s + Math.abs(toNumber(e.amount)), 0)
  const depositHeld = entries
    .filter((e) => DEPOSIT_TYPES.includes(e.entry_type))
    .reduce((s, e) => s + Math.abs(toNumber(e.amount)) * (e.entry_type === 'deposit' ? 1 : -1), 0)
  const balance = running

  const isReversed = (id: number) =>
    entries.some(e => e.reversed_entry_id === id)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-red-500">{t('ledger.totalCharged')}</p>
          <p className="mt-0.5 text-lg font-bold text-red-700">{fmt(totalDebits)}</p>
        </div>
        <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-green-500">{t('ledger.totalPaid')}</p>
          <p className="mt-0.5 text-lg font-bold text-green-700">{fmt(totalCredits)}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-500">
            {t('ledger.depositHeld')}
          </p>
          <p className="mt-0.5 text-lg font-bold text-blue-700">{fmt(depositHeld)}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${
          balance > 0
            ? 'border-orange-100 bg-orange-50'
            : balance < 0
            ? 'border-teal-100 bg-teal-50'
            : 'border-gray-100 bg-gray-50'
        }`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${
            balance > 0 ? 'text-orange-500' : balance < 0 ? 'text-teal-500' : 'text-gray-500'
          }`}>
            {balance > 0 ? t('ledger.balanceDue') : balance < 0 ? t('ledger.overpaid') : t('ledger.settled')}
          </p>
          <p className={`mt-0.5 text-lg font-bold ${
            balance > 0 ? 'text-orange-700' : balance < 0 ? 'text-teal-700' : 'text-gray-600'
          }`}>
            {fmt(balance)}
          </p>
        </div>
      </div>

      {/* Ledger table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="w-8 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
                #
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Date / Time
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-red-500">
                Debit (Charged)
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-green-600">
                Credit (Paid)
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Balance
              </th>
              {onReverse && (
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('common.actions')}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((entry) => {
              const meta = TYPE_META[entry.entry_type] ?? {
                label: entry.entry_type,
                badge: 'bg-gray-100 text-gray-700 border border-gray-200',
                icon: null,
              }
              const reversed = isReversed(entry.id)
              const isReversal = entry.entry_type === 'reversal'
              const rowFade = reversed ? 'opacity-50' : ''

              return (
                <tr
                  key={entry.id}
                  className={`${isReversal ? 'bg-amber-50' : 'hover:bg-gray-50'} ${rowFade}`}
                >
                  {/* Seq */}
                  <td className="px-3 py-3 text-center text-xs text-gray-500">
                    {entry.seq}
                  </td>

                  {/* Date */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="font-medium text-gray-700">{fmtDate(entry.created_at)}</p>
                    <p className="text-xs text-gray-500">{fmtTime(entry.created_at)}</p>
                  </td>

                  {/* Type badge */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge} ${
                        reversed ? 'line-through opacity-70' : ''
                      }`}
                    >
                      {meta.icon}
                      {t(meta.label)}
                    </span>
                    {reversed && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        <RotateCcw className="h-2.5 w-2.5" />
                        reversed
                      </span>
                    )}
                  </td>

                  {/* Description */}
                  <td className="max-w-xs px-4 py-3">
                    <p className={`text-gray-700 ${reversed ? 'line-through' : ''}`}>
                      {entry.description}
                    </p>
                    {entry.payment_method && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {PAYMENT_METHOD_LABELS[entry.payment_method] ?? entry.payment_method}
                        {entry.payment_reference && (
                          <> · Ref: <span className="font-mono">{entry.payment_reference}</span></>
                        )}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="mt-0.5 text-xs italic text-gray-500">{entry.notes}</p>
                    )}
                    {entry.created_by_name && (
                      <p className="mt-0.5 text-xs text-gray-500">by {entry.created_by_name}</p>
                    )}
                  </td>

                  {/* Debit */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {entry.amount > 0 ? (
                      <span className="font-semibold text-red-600">{fmt(entry.amount)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Credit */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {entry.amount < 0 ? (
                      <span className="font-semibold text-green-600">{fmt(entry.amount)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Running balance */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span
                      className={`font-bold ${
                        entry.runningBalance > 0
                          ? 'text-red-700'
                          : entry.runningBalance < 0
                          ? 'text-teal-600'
                          : 'text-gray-500'
                      }`}
                    >
                      {fmt(entry.runningBalance)}
                    </span>
                    {entry.runningBalance > 0 && (
                      <p className="text-xs font-normal text-red-400">owed</p>
                    )}
                    {entry.runningBalance < 0 && (
                      <p className="text-xs font-normal text-teal-500">overpaid</p>
                    )}
                    {entry.runningBalance === 0 && (
                      <p className="text-xs font-normal text-gray-500">settled</p>
                    )}
                  </td>
                  {onReverse && (
                    <td className="px-4 py-3 text-right">
                      {reversed || entry.entry_type === 'reversal' ? (
                        <span className="text-xs text-gray-400">
                          {reversed ? t('ledger.alreadyReversed') : '—'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onReverse({ id: entry.id, description: entry.description })
                          }
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('ledger.reverse')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>

          {/* Footer totals row */}
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Totals ({rows.length} {rows.length === 1 ? 'entry' : 'entries'})
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-red-700">
                {fmt(totalDebits)}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                {fmt(totalCredits)}
              </td>
              <td className={`px-4 py-3 text-right text-sm font-bold ${
                balance > 0 ? 'text-red-700' : balance < 0 ? 'text-teal-600' : 'text-gray-600'
              }`}>
                {fmt(balance)}
              </td>
              {onReverse && <td className="px-4 py-3" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
