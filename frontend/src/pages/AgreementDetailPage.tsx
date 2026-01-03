import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Car, CreditCard, FileText, User, UserCheck, Shield } from 'lucide-react'
import { agreementsService, PostPaymentData } from '@/services/agreements'
import LedgerTable from '@/components/ledger/LedgerTable'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-blue-100 text-blue-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'details' | 'ledger' | 'vehicles'>('details')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const idString = id ?? ''
  const isValidId = /^\d+$/.test(idString)
  const agreementId = isValidId ? Number.parseInt(idString, 10) : null

  const { data: agreement, isLoading, error } = useQuery({
    queryKey: ['agreement', idString],
    queryFn: () => {
      if (!agreementId) {
        throw new Error('Invalid agreement id')
      }
      return agreementsService.getById(agreementId)
    },
    enabled: agreementId !== null,
  })

  const closeMutation = useMutation({
    mutationFn: (data: { actual_return_datetime: string; return_mileage?: number }) =>
      agreementsService.close(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
    },
    onError: (err: any) => {
      console.error('Close agreement error:', err)
      setPageError(err?.response?.data?.detail || err?.message || 'Failed to close agreement')
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (data: PostPaymentData) => agreementsService.postPayment(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      setShowPaymentModal(false)
    },
    onError: (err: any) => {
      console.error('Post payment error:', err)
      setPageError(err?.response?.data?.detail || err?.message || 'Failed to post payment')
    },
  })

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!agreementId) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">Invalid agreement id</div>
      </div>
    )
  }

  if (error || !agreement) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">Agreement not found</div>
      </div>
    )
  }

  const handleClose = () => {
    if (confirm('Are you sure you want to close this agreement?')) {
      closeMutation.mutate({
        actual_return_datetime: new Date().toISOString(),
      })
    }
  }

  return (
    <div className="p-6">
      {pageError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
          {pageError}
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/agreements')}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agreements
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{agreement.agreement_number}</h1>
            <p className="text-gray-500">{agreement.customer_name}</p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                statusColors[agreement.status]
              }`}
            >
              {t(`agreements.status.${agreement.status}`)}
            </span>
            {agreement.status === 'active' && (
              <button
                onClick={handleClose}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Close Agreement
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">Total Charges</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatCurrency(agreement.total_charges)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">Total Payments</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(agreement.total_payments)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">Balance Due</div>
          <div
            className={`text-2xl font-bold ${
              agreement.balance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(agreement.balance)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">Daily Rate</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatCurrency(agreement.agreed_daily_rate)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'details', label: 'Details', icon: FileText },
            { id: 'ledger', label: 'Ledger', icon: CreditCard },
            { id: 'vehicles', label: 'Vehicles', icon: Car },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="rounded-lg bg-white p-6 shadow">
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Customer Information */}
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                <User className="h-5 w-5 text-blue-500" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{agreement.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer ID</span>
                  <span>#{agreement.customer_id}</span>
                </div>
              </div>
            </div>

            {/* Driver Information (if any) */}
            {agreement.driver && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  Driver Information
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name</span>
                    <span className="font-medium">
                      {agreement.driver.first_name} {agreement.driver.last_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone</span>
                    <span>{agreement.driver.phone_primary}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">License Number</span>
                    <span>{agreement.driver.license_number}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Collateral Person Information (if any) */}
            {agreement.collateral_person && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                  <Shield className="h-5 w-5 text-orange-600" />
                  Collateral Person
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name</span>
                    <span className="font-medium">
                      {agreement.collateral_person.first_name} {agreement.collateral_person.last_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone</span>
                    <span>{agreement.collateral_person.phone_primary}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ID Type</span>
                    <span>{agreement.collateral_person.id_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ID Number</span>
                    <span>{agreement.collateral_person.id_number}</span>
                  </div>
                  {agreement.collateral_person.relationship_to_customer && (
                    <div className="flex justify-between md:col-span-2">
                      <span className="text-gray-500">Relationship</span>
                      <span>{agreement.collateral_person.relationship_to_customer}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rental Period & Locations */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 font-semibold text-gray-800">Rental Period</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pickup</span>
                    <span>{formatDate(agreement.pickup_datetime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expected Return</span>
                    <span>{formatDate(agreement.expected_return_datetime)}</span>
                  </div>
                  {agreement.actual_return_datetime && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Actual Return</span>
                      <span>{formatDate(agreement.actual_return_datetime)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-4 font-semibold text-gray-800">Locations</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pickup Location</span>
                    <span>{agreement.pickup_location || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Return Location</span>
                    <span>{agreement.return_location || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Advance Payment (if any) */}
            {agreement.advance_payment && agreement.advance_payment > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Advance Payment</span>
                  <span className="text-lg font-bold text-green-700">
                    {formatCurrency(agreement.advance_payment)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            {agreement.notes && (
              <div>
                <h3 className="mb-2 font-semibold text-gray-800">Notes</h3>
                <p className="text-gray-600">{agreement.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ledger' && (
          <div>
            <div className="mb-4 flex justify-end">
              {agreement.status === 'active' && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Post Payment
                </button>
              )}
            </div>
            <LedgerTable agreementId={Number(id)} />
          </div>
        )}

        {activeTab === 'vehicles' && (
          <div className="space-y-4">
            {agreement.vehicle_segments.map((segment) => (
              <div key={segment.id} className="rounded-lg border p-4">
                <div className="flex items-center gap-4">
                  <Car className="h-10 w-10 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {segment.make} {segment.model}
                    </div>
                    <div className="text-sm text-gray-500">{segment.plate_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(segment.daily_rate)}/day</div>
                    <div className="text-sm text-gray-500">
                      {formatDate(segment.start_datetime).split(',')[0]} -{' '}
                      {formatDate(segment.end_datetime).split(',')[0]}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          onClose={() => setShowPaymentModal(false)}
          onSubmit={(data) => paymentMutation.mutate(data)}
          isLoading={paymentMutation.isPending}
          balance={agreement.balance}
        />
      )}
    </div>
  )
}

function PaymentModal({
  onClose,
  onSubmit,
  isLoading,
  balance,
}: {
  onClose: () => void
  onSubmit: (data: PostPaymentData) => void
  isLoading: boolean
  balance: number
}) {
  const [amount, setAmount] = useState(balance > 0 ? balance.toString() : '')
  const [method, setMethod] = useState<PostPaymentData['payment_method']>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = amount.trim()
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Please enter a valid payment amount greater than 0.')
      return
    }

    setError(null)
    onSubmit({
      amount: parsed,
      payment_method: method,
      payment_reference: reference || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">Post Payment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount (ETB)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (error) setError(null)
              }}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PostPaymentData['payment_method'])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="telebirr">TeleBirr</option>
              <option value="cbe_birr">CBE Birr</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reference (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !amount}
              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Post Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
