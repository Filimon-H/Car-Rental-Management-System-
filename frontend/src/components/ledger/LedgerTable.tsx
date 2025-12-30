import { useQuery } from '@tanstack/react-query'
import { agreementsService, LedgerEntry } from '@/services/agreements'

const entryTypeColors: Record<string, string> = {
  charge: 'text-red-600',
  payment: 'text-green-600',
  deposit: 'text-blue-600',
  deposit_return: 'text-orange-600',
  adjustment: 'text-purple-600',
  reversal: 'text-gray-600',
  damage_charge: 'text-red-700',
  late_fee: 'text-red-500',
}

const entryTypeLabels: Record<string, string> = {
  charge: 'Charge',
  payment: 'Payment',
  deposit: 'Deposit',
  deposit_return: 'Deposit Return',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  damage_charge: 'Damage Charge',
  late_fee: 'Late Fee',
}

interface LedgerTableProps {
  agreementId: number
}

export default function LedgerTable({ agreementId }: LedgerTableProps) {
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['ledger', agreementId],
    queryFn: () => agreementsService.getLedger(agreementId),
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(Math.abs(amount))
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

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-600">
        Error loading ledger entries
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">
        No ledger entries yet
      </div>
    )
  }

  // Calculate running balance
  let runningBalance = 0
  const entriesWithBalance = entries.map((entry) => {
    runningBalance += entry.amount
    return { ...entry, balance: runningBalance }
  })

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Description
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Method
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Amount
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Balance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {entriesWithBalance.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(entry.created_at)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <span className={entryTypeColors[entry.entry_type] || 'text-gray-600'}>
                  {entryTypeLabels[entry.entry_type] || entry.entry_type}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {entry.description}
                {entry.notes && (
                  <span className="block text-xs text-gray-400">{entry.notes}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {entry.payment_method ? (
                  <span className="capitalize">
                    {entry.payment_method.replace('_', ' ')}
                  </span>
                ) : (
                  '-'
                )}
                {entry.payment_reference && (
                  <span className="block text-xs text-gray-400">
                    Ref: {entry.payment_reference}
                  </span>
                )}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${
                  entry.amount > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {entry.amount > 0 ? '+' : '-'}
                {formatCurrency(entry.amount)}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right text-sm font-bold ${
                  entry.balance > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {formatCurrency(entry.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
