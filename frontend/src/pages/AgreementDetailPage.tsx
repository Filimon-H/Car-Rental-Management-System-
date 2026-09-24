import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Ban,
  Car,
  CreditCard,
  FileText,
  User,
  UserCheck,
  Shield,
  Printer,
} from 'lucide-react'
import {
  agreementsService,
  PostChargeData,
  PostDepositData,
  PostPaymentData,
  AgreementDetail,
  BookingApprovalData,
  ledgerService,
  availabilityService,
} from '@/services/agreements'
import { customersService } from '@/services/customers'
import { collateralsService } from '@/services/collaterals'
import { vehiclesService } from '@/services/vehicles'
import LedgerTable from '@/components/ledger/LedgerTable'
import { getErrorMessage } from '@/services/apiClient'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import {
  datetimeLocalToWallClockIso,
  localNowWallClockIso,
  toDatetimeLocalValue,
  toNumber,
} from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { documentsService } from '@/services/documents'

const statusColors: Record<string, string> = {
  booking_requested: 'bg-orange-100 text-orange-800',
  draft: 'bg-gray-100 text-gray-800',
  pending_payment: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  returned: 'bg-purple-100 text-purple-800',
  closed: 'bg-blue-100 text-blue-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'details' | 'ledger' | 'vehicles'>('details')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState<null | 'receive' | 'apply' | 'refund'>(
    null
  )
  const [showChargeModal, setShowChargeModal] = useState<null | 'damage' | 'late'>(null)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | 'activate'>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<{
    id: number
    description: string
    amount: number | string
  } | null>(null)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)
  const [showSettlementModal, setShowSettlementModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const idString = id ?? ''
  const isValidId = /^\d+$/.test(idString)
  const agreementId = isValidId ? Number.parseInt(idString, 10) : null

  const {
    data: agreement,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['agreement', idString],
    queryFn: () => {
      if (!agreementId) {
        throw new Error('Invalid agreement id')
      }
      return agreementsService.getById(agreementId)
    },
    enabled: agreementId !== null,
  })

  const depositMutation = useMutation({
    mutationFn: async (payload: { action: 'receive' | 'apply' | 'refund'; data: unknown }) => {
      if (!agreementId) throw new Error('Invalid agreement id')
      if (payload.action === 'receive')
        return agreementsService.receiveDeposit(agreementId, payload.data as PostDepositData)
      if (payload.action === 'apply')
        return agreementsService.applyDeposit(agreementId, payload.data as { amount: number })
      return agreementsService.refundDeposit(agreementId, payload.data as { amount: number })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowDepositModal(null)
    },
    onError: (err: unknown) => {
      console.error('Deposit action error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Deposit action failed'))
    },
  })

  const chargeMutation = useMutation({
    mutationFn: async (payload: { action: 'damage' | 'late'; data: PostChargeData }) => {
      if (!agreementId) throw new Error('Invalid agreement id')
      if (payload.action === 'damage')
        return agreementsService.postDamageCharge(agreementId, payload.data)
      return agreementsService.postLateFee(agreementId, payload.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowChargeModal(null)
    },
    onError: (err: unknown) => {
      console.error('Charge action error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to post charge'))
    },
  })

  const adjustmentMutation = useMutation({
    mutationFn: (data: { amount: number; description: string; notes?: string }) => {
      if (!agreementId) throw new Error('Invalid agreement id')
      return agreementsService.postAdjustment(agreementId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] })
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowAdjustmentModal(false)
    },
    onError: (error: unknown) => {
      setPageError(getErrorMessage(error, 'Failed to post adjustment'))
    },
  })

  const reverseMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      ledgerService.reverseEntry(entryId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] })
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setReverseTarget(null)
    },
    onError: (error: unknown) => {
      setPageError(getErrorMessage(error, t('ledger.reverseFailed')))
    },
  })

  const receiptMutation = useMutation({
    mutationFn: (paymentId: number) => {
      if (!agreementId) throw new Error('Invalid agreement id')
      return documentsService.generateReceipt(agreementId, paymentId)
    },
    onError: (error: unknown) => setPageError(getErrorMessage(error, t('ledger.receiptFailed'))),
  })

  const addVehicleMutation = useMutation({
    mutationFn: (data: {
      vehicle_id: number
      daily_rate: number
      start_datetime: string
      end_datetime: string
    }) => {
      if (!agreementId) throw new Error('Invalid agreement id')
      return agreementsService.addVehicleToWedding(agreementId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowAddVehicle(false)
    },
    onError: (error: unknown) => {
      setPageError(getErrorMessage(error, t('agreements.addVehicleFailed')))
    },
  })

  const primaryVehicleId = agreement?.vehicle_segments?.[0]?.vehicle_id

  const { data: customer } = useQuery({
    queryKey: ['customer', agreement?.customer_id],
    queryFn: () => customersService.getById(agreement!.customer_id),
    enabled: !!agreement?.customer_id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: collateral } = useQuery({
    queryKey: ['collateral', agreement?.collateral_person_id],
    queryFn: () => collateralsService.get(agreement!.collateral_person_id as number),
    enabled: !!agreement?.collateral_person_id,
  })

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', primaryVehicleId],
    queryFn: () => vehiclesService.getById(primaryVehicleId as number),
    enabled: !!primaryVehicleId,
  })

  const closeMutation = useMutation({
    mutationFn: (data: { actual_return_datetime: string; return_mileage?: number }) =>
      agreementsService.close(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowSettlementModal(false)
    },
    onError: (err: unknown) => {
      console.error('Close agreement error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to close agreement'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: () => agreementsService.activate(agreementId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
    },
    onError: (err: unknown) => {
      console.error('Activate agreement error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to activate agreement'))
    },
  })

  const returnMutation = useMutation({
    mutationFn: (data: {
      actual_return_datetime: string
      return_mileage?: number
      fuel_level_in?: number
      notes?: string
    }) => agreementsService.markReturned(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowReturnModal(false)
    },
    onError: (err: unknown) => {
      console.error('Return agreement error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to mark agreement returned'))
    },
  })

  const extendMutation = useMutation({
    mutationFn: (newReturnDatetime: string) =>
      agreementsService.extend(agreementId as number, newReturnDatetime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowExtendModal(false)
      setExtendError(null)
      toast({ description: t('agreementActions.extendSuccess') })
    },
    onError: (error: unknown) => {
      setExtendError(getErrorMessage(error, t('agreementActions.extendFailed')))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => agreementsService.cancel(agreementId as number, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowCancelConfirm(false)
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to cancel agreement'))
    },
  })

  const approveRequestMutation = useMutation({
    mutationFn: (data: BookingApprovalData) => agreementsService.approveRequest(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowApprovalModal(false)
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to approve booking request'))
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (data: PostPaymentData) =>
      agreementsService.postPayment(agreementId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', idString] })
      // LedgerTable keys on the numeric id, so the table and its totals
      // stayed stale after a payment until the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['ledger', agreementId] })
      setShowPaymentModal(false)
    },
    onError: (err: unknown) => {
      console.error('Post payment error:', err)
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      setPageError(getErrorMessage(error, 'Failed to post payment'))
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
        <div className="text-center text-red-500">{t('agreementActions.invalidAgreementId')}</div>
      </div>
    )
  }

  if (error || !agreement) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">{t('agreementPrint.notFound')}</div>
      </div>
    )
  }

  const shownBalance = agreement.balance_due ?? agreement.balance
  const depositHeld = agreement.deposit_held ?? 0
  const depositReceived = agreement.deposit_received ?? 0
  const depositApplied = agreement.deposit_applied ?? 0
  const depositReturned = agreement.deposit_returned ?? 0

  // Each settlement action is gated by the statuses it actually makes sense
  // in, not by one blanket `active` check. Gating the whole block on `active`
  // deadlocked the flow: activation needs the deposit, but the deposit could
  // only be taken once active.
  const depositOutstanding = (agreement.deposit_amount ?? 0) - depositReceived
  const canReceiveDeposit =
    ['pending_payment', 'active', 'overdue'].includes(agreement.status) && depositOutstanding > 0
  const canPostPayment = ['pending_payment', 'active', 'overdue'].includes(agreement.status)
  const canPostCharge = ['active', 'overdue'].includes(agreement.status)
  const canSettleDeposit = ['active', 'overdue', 'returned', 'closed'].includes(agreement.status)
  const showSettlementActions = canReceiveDeposit || canPostCharge || canSettleDeposit

  const handleActivate = () => setConfirmAction('activate')

  return (
    <div className="p-6">
      {pageError && <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{pageError}</div>}
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/agreements')}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('agreementCreate.backToAgreements')}
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{agreement.agreement_number}</h1>
            <p className="text-gray-500">{agreement.customer_name}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/agreements/${id}/print`)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-gray-600 hover:bg-gray-50"
              title="Print Agreement"
            >
              <Printer className="h-4 w-4" />
              {t('sections.print')}
            </button>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                statusColors[agreement.status]
              }`}
            >
              {t(`agreements.status.${agreement.status}`)}
            </span>
            {/* Workflow buttons based on status */}
            {agreement.status === 'booking_requested' && (
              <>
                <button
                  onClick={() => setShowApprovalModal(true)}
                  disabled={approveRequestMutation.isPending}
                  className="rounded-lg bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-60"
                >
                  {approveRequestMutation.isPending ? 'Approving…' : 'Approve Booking'}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50"
                >
                  <Ban className="h-4 w-4" />
                  {t('agreementActions.decline')}
                </button>
              </>
            )}
            {(agreement.status === 'draft' || agreement.status === 'pending_payment') && (
              <>
                <button
                  onClick={handleActivate}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  {t('agreementActions.activateHandover')}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50"
                >
                  <Ban className="h-4 w-4" />
                  {t('common.cancel')}
                </button>
              </>
            )}
            {(agreement.status === 'active' || agreement.status === 'overdue') && (
              <>
                <button
                  onClick={() => {
                    setExtendError(null)
                    setShowExtendModal(true)
                  }}
                  className="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50"
                >
                  {t('agreementActions.extend')}
                </button>
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                >
                  {t('agreementActions.returnAndClose')}
                </button>
              </>
            )}
            {agreement.status === 'returned' && (
              <button
                onClick={() => setShowSettlementModal(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                {t('agreementActions.closeAgreement')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">{t('ledger.totalCharges')}</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatCurrency(agreement.total_charges)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">{t('ledger.totalPayments')}</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(agreement.total_payments)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">{t('ledger.balanceDue')}</div>
          <div
            className={`text-2xl font-bold ${shownBalance > 0 ? 'text-red-600' : 'text-green-600'}`}
          >
            {formatCurrency(shownBalance)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-gray-500">{t('ledger.depositHeld')}</div>
          <div className="text-2xl font-bold text-gray-800">{formatCurrency(depositHeld)}</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          {/* Wedding agreements store the summed vehicle total in this field,
              so calling it a daily rate misreports it. */}
          <div className="text-sm text-gray-500">
            {agreement.agreement_type === 'wedding'
              ? t('agreements.totalVehicleAmount')
              : t('weddingAgreementCreate.dailyRate')}
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {formatCurrency(agreement.agreed_daily_rate)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'details', label: t('options.details'), icon: FileText },
            { id: 'ledger', label: t('nav.ledger'), icon: CreditCard },
            { id: 'vehicles', label: t('nav.vehicles'), icon: Car },
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
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">
                  {t('sections.depositDeductions')}
                </div>
                {showSettlementActions && (
                  <div className="flex flex-wrap gap-2">
                    {canReceiveDeposit && (
                      <button
                        type="button"
                        onClick={() => setShowDepositModal('receive')}
                        className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        {t('ledger.receiveDeposit')}
                      </button>
                    )}
                    {canPostCharge && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowChargeModal('damage')}
                          className="rounded-md border bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('agreementActions.addDamageCharge')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowChargeModal('late')}
                          className="rounded-md border bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('agreementActions.addLateFee')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAdjustmentModal(true)}
                          className="rounded-md border bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('ledger.addAdjustment')}
                        </button>
                      </>
                    )}
                    {canSettleDeposit && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowDepositModal('apply')}
                          disabled={depositHeld <= 0 || shownBalance <= 0}
                          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          {t('ledger.applyDeposit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDepositModal('refund')}
                          disabled={depositHeld <= 0}
                          className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {t('ledger.refundDeposit')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('ledger.depositReceived')}</span>
                  <span className="font-medium">{formatCurrency(depositReceived)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('ledger.depositApplied')}</span>
                  <span className="font-medium">{formatCurrency(depositApplied)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('ledger.depositRefunded')}</span>
                  <span className="font-medium">{formatCurrency(depositReturned)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('ledger.depositHeld')}</span>
                  <span className="font-medium">{formatCurrency(depositHeld)}</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">{t('ledger.depositHelper')}</div>
            </div>

            {/* Customer Information */}
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                <User className="h-5 w-5 text-blue-500" />
                {t('sections.customerInformation')}
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('customers.columns.name')}</span>
                  <span className="font-medium">{agreement.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('sections.customerId')}</span>
                  <span>#{agreement.customer_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('agreementCreate.phone')}</span>
                  <span className="font-medium">{customer?.phone_primary || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('agreementCreate.city')}</span>
                  <span className="font-medium">{customer?.city || '—'}</span>
                </div>

                {/* Identity */}
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('agreementCreate.idType')}</span>
                  <span className="font-medium capitalize">
                    {customer?.id_type?.replace('_', ' ') || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('agreementCreate.idNumber')}</span>
                  <span className="font-medium">{customer?.id_number || '—'}</span>
                </div>

                {/* Driver's license */}
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('customerCreate.driverLicense')}</span>
                  <span className="font-medium">{customer?.driver_license_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('drivers.columns.licenseExpiry')}</span>
                  <span className="font-medium">
                    {customer?.driver_license_expiry
                      ? new Date(customer.driver_license_expiry).toLocaleDateString('en-GB')
                      : '—'}
                  </span>
                </div>

                {/* Emergency contact */}
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('sections.emergencyContact')}</span>
                  <span className="font-medium">{customer?.emergency_contact_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('sections.emergencyPhone')}</span>
                  <span className="font-medium">{customer?.emergency_contact_phone || '—'}</span>
                </div>
              </div>
            </div>

            {/* Vehicle Information */}
            {vehicle && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                  <Car className="h-5 w-5 text-primary" />
                  {t('sections.vehicleInformation')}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('vehicles.plateNumber')}</span>
                    <span className="font-medium">{vehicle.plate_number || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('vehicleFields.plateCode')}</span>
                    <span className="font-medium">{vehicle.plate_code || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('vehicles.model')}</span>
                    <span className="font-medium">{vehicle.model || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('inspection.serviceType')}</span>
                    <span className="font-medium">{vehicle.service_type || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('vehicleUpsert.fuelType')}</span>
                    <span className="font-medium">{vehicle.fuel_type || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('vehicleUpsert.insuranceExpiry')}</span>
                    <span className="font-medium">
                      {vehicle.insurance_expiry ? vehicle.insurance_expiry.split('T')[0] : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Driver Information (if any) */}
            {agreement.driver && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  {t('sections.driverInformation')}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customers.columns.name')}</span>
                    <span className="font-medium">
                      {agreement.driver.first_name} {agreement.driver.last_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.phone')}</span>
                    <span>{agreement.driver.phone_primary}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('driver.licenseNumber')}</span>
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
                  {t('collaterals.columns.person')}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customers.columns.name')}</span>
                    <span className="font-medium">
                      {agreement.collateral_person.first_name}{' '}
                      {agreement.collateral_person.last_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.phone')}</span>
                    <span>{agreement.collateral_person.phone_primary}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.idType')}</span>
                    <span>{agreement.collateral_person.id_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.idNumber')}</span>
                    <span>{agreement.collateral_person.id_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customerCreate.secondaryPhone')}</span>
                    <span>{collateral?.phone_secondary || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customerCreate.email')}</span>
                    <span>{collateral?.email || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.city')}</span>
                    <span>{collateral?.city || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customerCreate.subcity')}</span>
                    <span>{collateral?.subcity || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('customerCreate.wereda')}</span>
                    <span>{collateral?.wereda || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('sections.houseNo')}</span>
                    <span>{collateral?.house_number || '—'}</span>
                  </div>
                  {agreement.collateral_person.relationship_to_customer && (
                    <div className="flex justify-between md:col-span-2">
                      <span className="text-gray-500">{t('agreementCreate.relationship')}</span>
                      <span>{agreement.collateral_person.relationship_to_customer}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rental Period & Locations */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 font-semibold text-gray-800">
                  {t('agreementCreate.rentalPeriod')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementActions.pickup')}</span>
                    <span>{formatDate(agreement.pickup_datetime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementActions.expectedReturn')}</span>
                    <span>{formatDate(agreement.expected_return_datetime)}</span>
                  </div>
                  {agreement.actual_return_datetime && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('agreementActions.actualReturn')}</span>
                      <span>{formatDate(agreement.actual_return_datetime)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-4 font-semibold text-gray-800">{t('sections.locations')}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.pickupLocation')}</span>
                    <span>{agreement.pickup_location || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('agreementCreate.returnLocation')}</span>
                    <span>{agreement.return_location || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Advance Payment (if any) */}
            {agreement.advance_payment && agreement.advance_payment > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{t('ledger.advancePayment')}</span>
                  <span className="text-lg font-bold text-green-700">
                    {formatCurrency(agreement.advance_payment)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            {agreement.notes && (
              <div>
                <h3 className="mb-2 font-semibold text-gray-800">{t('agreementCreate.notes')}</h3>
                <p className="text-gray-600">{agreement.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">
                  {t('ledger.financialLedger')}
                </h3>
                <p className="text-xs text-gray-500">
                  Append-only audit trail — every charge, payment, and adjustment
                </p>
              </div>
              {canPostPayment && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  + Post Payment
                </button>
              )}
            </div>
            <LedgerTable
              agreementId={Number(id)}
              onReverse={canPostCharge ? setReverseTarget : undefined}
              onReceipt={(entryId) => receiptMutation.mutate(entryId)}
            />
          </div>
        )}

        {activeTab === 'vehicles' && (
          <div className="space-y-4">
            {agreement.agreement_type === 'wedding' &&
              ['draft', 'pending_payment', 'active'].includes(agreement.status) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddVehicle(true)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    + {t('agreements.addVehicle')}
                  </button>
                </div>
              )}
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

      {showDepositModal && (
        <AmountModal
          title={
            showDepositModal === 'receive'
              ? 'Receive Deposit'
              : showDepositModal === 'apply'
                ? 'Apply Deposit'
                : 'Refund Deposit'
          }
          maxAmount={showDepositModal === 'receive' ? undefined : depositHeld}
          defaultAmount={
            showDepositModal === 'apply'
              ? Math.min(depositHeld, shownBalance).toString()
              : showDepositModal === 'refund'
                ? depositHeld.toString()
                : ''
          }
          requirePaymentMethod={showDepositModal === 'receive'}
          onClose={() => setShowDepositModal(null)}
          onSubmit={(payload) => {
            if (showDepositModal === 'receive') {
              depositMutation.mutate({ action: 'receive', data: payload })
              return
            }
            depositMutation.mutate({ action: showDepositModal, data: payload })
          }}
          isLoading={depositMutation.isPending}
        />
      )}

      {showChargeModal && (
        <AmountModal
          title={showChargeModal === 'damage' ? 'Add Damage Charge' : 'Add Late Fee'}
          requirePaymentMethod={false}
          onClose={() => setShowChargeModal(null)}
          onSubmit={(payload) => {
            const data: PostChargeData = {
              amount: payload.amount as number,
              description: payload.description as string | undefined,
              notes: payload.notes as string | undefined,
            }
            chargeMutation.mutate({ action: showChargeModal, data })
          }}
          isLoading={chargeMutation.isPending}
          showDescription
        />
      )}

      {showAdjustmentModal && (
        <AmountModal
          title={t('ledger.addAdjustment')}
          requirePaymentMethod={false}
          allowNegative
          hint={t('ledger.adjustmentHint')}
          onClose={() => setShowAdjustmentModal(false)}
          onSubmit={(payload) => {
            adjustmentMutation.mutate({
              amount: payload.amount as number,
              description: (payload.description as string) ?? '',
              notes: payload.notes as string | undefined,
            })
          }}
          isLoading={adjustmentMutation.isPending}
          showDescription
        />
      )}

      {reverseTarget && (
        <ReverseEntryModal
          entry={reverseTarget}
          isLoading={reverseMutation.isPending}
          onClose={() => setReverseTarget(null)}
          onConfirm={(reason) => reverseMutation.mutate({ entryId: reverseTarget.id, reason })}
        />
      )}

      {showAddVehicle && (
        <AddWeddingVehicleModal
          defaultStart={agreement.pickup_datetime}
          defaultEnd={agreement.expected_return_datetime}
          isLoading={addVehicleMutation.isPending}
          onClose={() => setShowAddVehicle(false)}
          onSubmit={(data) => addVehicleMutation.mutate(data)}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={t('agreementActions.confirmActivateTitle')}
          message={t('agreementActions.confirmActivateBody')}
          confirmLabel={t('agreementActions.activateHandover')}
          isLoading={activateMutation.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            activateMutation.mutate()
            setConfirmAction(null)
          }}
        />
      )}

      {showApprovalModal && (
        <BookingApprovalModal
          agreement={agreement}
          isLoading={approveRequestMutation.isPending}
          onClose={() => setShowApprovalModal(false)}
          onSubmit={(data) => approveRequestMutation.mutate(data)}
        />
      )}

      {showReturnModal && (
        <ReturnModal
          onClose={() => setShowReturnModal(false)}
          onSubmit={(data) => returnMutation.mutate(data)}
          isLoading={returnMutation.isPending}
        />
      )}

      {showExtendModal && (
        <ExtendAgreementModal
          currentReturn={agreement.expected_return_datetime}
          dailyRate={agreement.agreed_daily_rate}
          error={extendError}
          isLoading={extendMutation.isPending}
          onClose={() => {
            setShowExtendModal(false)
            setExtendError(null)
          }}
          onSubmit={(newReturnDatetime) => {
            setExtendError(null)
            extendMutation.mutate(newReturnDatetime)
          }}
        />
      )}

      {showCancelConfirm && (
        <CancelConfirmModal
          agreementNumber={agreement.agreement_number}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={(reason) => cancelMutation.mutate(reason)}
          isLoading={cancelMutation.isPending}
        />
      )}

      {showSettlementModal && (
        <SettlementModal
          agreement={agreement}
          depositHeld={depositHeld}
          balanceDue={shownBalance}
          onClose={() => setShowSettlementModal(false)}
          onApplyDeposit={(amount) => depositMutation.mutate({ action: 'apply', data: { amount } })}
          onRefundDeposit={(amount) =>
            depositMutation.mutate({ action: 'refund', data: { amount } })
          }
          onRecordPayment={() => setShowPaymentModal(true)}
          onClose_final={() => {
            closeMutation.mutate({
              actual_return_datetime: agreement.actual_return_datetime || localNowWallClockIso(),
            })
          }}
          isLoading={closeMutation.isPending || depositMutation.isPending}
        />
      )}
    </div>
  )
}

function AmountModal({
  title,
  onClose,
  onSubmit,
  isLoading,
  requirePaymentMethod,
  maxAmount,
  defaultAmount,
  showDescription,
  allowNegative = false,
  hint,
}: {
  title: string
  onClose: () => void
  onSubmit: (data: Record<string, unknown>) => void
  isLoading: boolean
  requirePaymentMethod: boolean
  maxAmount?: number
  defaultAmount?: string
  showDescription?: boolean
  /** Adjustments may be negative (a discount); everything else must be > 0. */
  allowNegative?: boolean
  hint?: string
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(defaultAmount ?? '')
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank_transfer' | 'telebirr' | 'cbe_birr' | 'check' | 'other'
  >('cash')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number.parseFloat(amount)
    if (!Number.isFinite(parsed) || (allowNegative ? parsed === 0 : parsed <= 0)) {
      setError(
        allowNegative ? t('validation.nonZeroAmountRequired') : t('validation.validAmountRequired')
      )
      return
    }
    if (typeof maxAmount === 'number' && parsed > maxAmount) {
      setError(`Amount cannot exceed ${maxAmount}.`)
      return
    }
    setError(null)
    const payload: Record<string, unknown> = { amount: parsed }
    if (requirePaymentMethod) payload.payment_method = paymentMethod
    if (notes.trim()) payload.notes = notes.trim()
    if (showDescription && description.trim()) payload.description = description.trim()
    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('common.close')}
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.amountEtb')}
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
          </div>

          {requirePaymentMethod && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('ledger.paymentMethod')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as
                      | 'cash'
                      | 'bank_transfer'
                      | 'telebirr'
                      | 'cbe_birr'
                      | 'check'
                      | 'other'
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="cash">{t('payment.cash')}</option>
                <option value="bank_transfer">{t('payment.bankTransfer')}</option>
                <option value="telebirr">{t('payment.telebirr')}</option>
                <option value="cbe_birr">{t('payment.cbeBirr')}</option>
                <option value="check">{t('payment.check')}</option>
                <option value="other">{t('payment.other')}</option>
              </select>
            </div>
          )}

          {showDescription && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('ledger.descriptionOptional')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.notesOptional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
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
  const { t } = useTranslation()
  const [amount, setAmount] = useState(balance > 0 ? balance.toString() : '')
  const [method, setMethod] = useState<PostPaymentData['payment_method']>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = amount.trim()
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('validation.validPaymentRequired'))
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
        <h2 className="mb-4 text-xl font-bold">{t('ledger.postPayment')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.amountEtb')}
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.paymentMethod')}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PostPaymentData['payment_method'])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="cash">{t('payment.cash')}</option>
              <option value="bank_transfer">{t('payment.bankTransfer')}</option>
              <option value="telebirr">{t('payment.telebirr')}</option>
              <option value="cbe_birr">{t('payment.cbeBirr')}</option>
              <option value="check">{t('payment.check')}</option>
              <option value="other">{t('payment.other')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.referenceOptional')}
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
              {t('common.cancel')}
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

function ExtendAgreementModal({
  currentReturn,
  dailyRate,
  error,
  isLoading,
  onClose,
  onSubmit,
}: {
  currentReturn: string
  dailyRate: number
  error: string | null
  isLoading: boolean
  onClose: () => void
  onSubmit: (newReturnDatetime: string) => void
}) {
  const { t } = useTranslation()
  const current = new Date(currentReturn)
  const earliestByPolicy = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  const earliest = new Date(Math.max(earliestByPolicy.getTime(), Date.now() + 60_000))
  const minimumValue = toDatetimeLocalValue(earliest)
  const [newReturn, setNewReturn] = useState(minimumValue)
  const selected = new Date(newReturn)
  const additionalDays = Number.isNaN(selected.getTime())
    ? 0
    : Math.max(0, Math.ceil((selected.getTime() - current.getTime()) / (24 * 60 * 60 * 1000)))
  const estimatedCharge = additionalDays * toNumber(dailyRate)
  const localError = selected <= current ? t('agreementActions.returnMustBeLater') : null
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (localError || Number.isNaN(selected.getTime())) return
    onSubmit(datetimeLocalToWallClockIso(newReturn))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{t('agreementActions.extendAgreement')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('common.close')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.newReturnDateTime')}
            </label>
            <input
              type="datetime-local"
              value={newReturn}
              min={minimumValue}
              onChange={(event) => setNewReturn(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="rounded-lg bg-blue-50 p-4">
            <div className="flex justify-between text-sm text-blue-900">
              <span>{t('agreementActions.estimatedExtensionCharge')}</span>
              <span className="font-semibold">{formatCurrency(estimatedCharge)}</span>
            </div>
            <p className="mt-1 text-xs text-blue-700">
              {additionalDays} day{additionalDays === 1 ? '' : 's'} ×{' '}
              {formatCurrency(toNumber(dailyRate))}
            </p>
          </div>

          {(localError || error) && (
            <p role="alert" className="text-sm text-red-600">
              {localError || error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading || !!localError || Number.isNaN(selected.getTime())}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? t('common.loading') : t('agreementActions.extend')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReturnModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void
  onSubmit: (data: {
    actual_return_datetime: string
    return_mileage?: number
    fuel_level_in?: number
    notes?: string
  }) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [returnDate, setReturnDate] = useState(toDatetimeLocalValue(new Date()))
  const [mileage, setMileage] = useState('')
  const [fuelLevel, setFuelLevel] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      actual_return_datetime: datetimeLocalToWallClockIso(returnDate),
      return_mileage: mileage ? Number.parseInt(mileage, 10) : undefined,
      fuel_level_in: fuelLevel ? Number.parseInt(fuelLevel, 10) : undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{t('agreementActions.markVehicleReturned')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.returnDateTime')}
            </label>
            <input
              type="datetime-local"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.returnMileageOptional')}
            </label>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.fuelLevelIn')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={fuelLevel}
              onChange={(e) => setFuelLevel(e.target.value)}
              placeholder="0–100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('ledger.notesOptional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes about the return condition..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SettlementModal({
  agreement,
  depositHeld,
  balanceDue,
  onClose,
  onApplyDeposit,
  onRefundDeposit,
  onRecordPayment,
  onClose_final,
  isLoading,
}: {
  agreement: AgreementDetail
  depositHeld: number
  balanceDue: number
  onClose: () => void
  onApplyDeposit: (amount: number) => void
  onRefundDeposit: (amount: number) => void
  onRecordPayment: () => void
  onClose_final: () => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const canApplyDeposit = depositHeld > 0 && balanceDue > 0
  const canRefundDeposit = depositHeld > 0 && balanceDue <= 0
  const canClose = balanceDue <= 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{t('agreementActions.settlementClose')}</h2>

        <div className="mb-6 space-y-3 rounded-lg bg-gray-50 p-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Charges:</span>
            <span className="font-semibold">{formatCurrency(agreement.total_charges)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('ledger.netAdjustments')}</span>
            <span className="font-semibold">{formatCurrency(agreement.net_adjustments ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Payments:</span>
            <span className="font-semibold text-green-600">
              {formatCurrency(agreement.total_payments)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Deposit Held:</span>
            <span className="font-semibold">{formatCurrency(depositHeld)}</span>
          </div>
          <hr />
          <div className="flex justify-between text-lg">
            <span className="font-medium">Balance Due:</span>
            <span className={`font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(balanceDue)}
            </span>
          </div>
        </div>

        <div className="mb-6 space-y-3">
          <h3 className="font-medium text-gray-700">{t('agreementActions.settlementActions')}</h3>

          {canApplyDeposit && (
            <button
              onClick={() => onApplyDeposit(Math.min(depositHeld, balanceDue))}
              disabled={isLoading}
              className="w-full rounded-lg border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              Apply Deposit to Balance ({formatCurrency(Math.min(depositHeld, balanceDue))})
            </button>
          )}

          {balanceDue > 0 && (
            <button
              onClick={onRecordPayment}
              disabled={isLoading}
              className="w-full rounded-lg border border-green-600 px-4 py-2 text-green-600 hover:bg-green-50 disabled:opacity-50"
            >
              Record Payment ({formatCurrency(balanceDue)})
            </button>
          )}

          {canRefundDeposit && (
            <button
              onClick={() => onRefundDeposit(depositHeld)}
              disabled={isLoading}
              className="w-full rounded-lg border border-purple-600 px-4 py-2 text-purple-600 hover:bg-purple-50 disabled:opacity-50"
            >
              Refund Deposit ({formatCurrency(depositHeld)})
            </button>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={onClose_final}
            disabled={isLoading || !canClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            title={!canClose ? 'Balance must be zero to close' : ''}
          >
            {isLoading ? 'Processing...' : 'Close Agreement'}
          </button>
        </div>

        {!canClose && (
          <p className="mt-3 text-center text-sm text-amber-600">
            Balance must be zero before closing. Apply deposit or record payment first.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Reversal dialog.
 *
 * The endpoint always reverses the full original amount — partial reversals
 * are not supported — so reusing AmountModal showed an editable Amount field
 * whose value was collected and then discarded. This shows the original
 * read-only and asks only for the reason, which is what is actually sent.
 */
/**
 * Adds a vehicle to an existing wedding agreement.
 *
 * Only vehicles free for the chosen window are offered, so the common
 * rejection never reaches the server; the backend still enforces it.
 */
function AddWeddingVehicleModal({
  defaultStart,
  defaultEnd,
  onClose,
  onSubmit,
  isLoading,
}: {
  defaultStart: string
  defaultEnd: string
  onClose: () => void
  onSubmit: (data: {
    vehicle_id: number
    daily_rate: number
    start_datetime: string
    end_datetime: string
  }) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const toLocal = (iso: string) => iso.slice(0, 16)
  const [start, setStart] = useState(toLocal(defaultStart))
  const [end, setEnd] = useState(toLocal(defaultEnd))
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [rate, setRate] = useState('')

  const datesValid = Boolean(start && end && end > start)

  const { data: vehicles, isLoading: loadingVehicles } = useQuery({
    queryKey: ['available-vehicles', start, end],
    queryFn: () => availabilityService.getAvailableVehicles(`${start}:00`, `${end}:00`),
    enabled: datesValid,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!vehicleId) return
          onSubmit({
            vehicle_id: vehicleId,
            daily_rate: Number.parseFloat(rate),
            start_datetime: `${start}:00`,
            end_datetime: `${end}:00`,
          })
        }}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold text-gray-900">{t('agreements.addVehicle')}</h2>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="awv-start" className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.pickup')}
            </label>
            <input
              id="awv-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="awv-end" className="mb-1 block text-sm font-medium text-gray-700">
              {t('agreementActions.return')}
            </label>
            <input
              id="awv-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="awv-vehicle" className="mb-1 block text-sm font-medium text-gray-700">
            {t('nav.vehicles')}
          </label>
          <select
            id="awv-vehicle"
            value={vehicleId ?? ''}
            onChange={(e) => {
              const id = Number.parseInt(e.target.value, 10)
              setVehicleId(Number.isFinite(id) ? id : null)
              const picked = vehicles?.find((v) => v.id === id)
              if (picked) setRate(String(picked.daily_rate))
            }}
            required
            disabled={!datesValid || loadingVehicles}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{t('ledger.selectVehicle', '—')}</option>
            {vehicles?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number} — {v.make} {v.model}
              </option>
            ))}
          </select>
          {datesValid && !loadingVehicles && vehicles?.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">{t('agreements.noVehiclesAvailable')}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="awv-rate" className="mb-1 block text-sm font-medium text-gray-700">
            {t('weddingAgreementCreate.dailyRate')}
          </label>
          <input
            id="awv-rate"
            type="number"
            step="0.01"
            min={0}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading || !vehicleId || !datesValid}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? t('common.loading') : t('agreements.addVehicle')}
          </button>
        </div>
      </form>
    </div>
  )
}

function ReverseEntryModal({
  entry,
  onClose,
  onConfirm,
  isLoading,
}: {
  entry: { id: number; description: string; amount: number | string }
  onClose: () => void
  onConfirm: (reason: string) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')

  const amount = new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
  }).format(Math.abs(toNumber(entry.amount)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(reason.trim())
        }}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">{t('ledger.reverseEntry')}</h2>
        <p className="mb-4 text-sm text-gray-500">
          {entry.description} — <span className="font-semibold">{amount}</span>
        </p>

        <div className="mb-4">
          <label htmlFor="reverse-reason" className="mb-1 block text-sm font-medium text-gray-700">
            {t('ledger.reverseReasonLabel')}
          </label>
          <input
            id="reverse-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading || !reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? t('common.loading') : t('ledger.reverse')}
          </button>
        </div>
      </form>
    </div>
  )
}

function CancelConfirmModal({
  agreementNumber,
  onClose,
  onConfirm,
  isLoading,
}: {
  agreementNumber: string
  onClose: () => void
  onConfirm: (reason: string) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          {t('agreementActions.cancelAgreement')}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          {t('common.cancel')}
          <span className="font-medium">{agreementNumber}</span>? The vehicle will be released back
          to available. This cannot be undone.
        </p>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('ledger.reasonOptional')}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed mind"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('sections.goBack')}
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isLoading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? 'Cancelling...' : 'Yes, Cancel Agreement'}
          </button>
        </div>
      </div>
    </div>
  )
}


/**
 * Commercial and handover terms, captured before a booking request is
 * approved.
 *
 * A request created through the customer portal carries no deposit, mileage
 * allowance or fuel reading, so the return charges added for staff-created
 * agreements could never apply to one. This collects them at the point of
 * approval; every field is optional, and a blank one is omitted rather than
 * sent as zero.
 */
function BookingApprovalModal({
  agreement,
  onClose,
  onSubmit,
  isLoading,
}: {
  agreement: AgreementDetail
  onClose: () => void
  onSubmit: (data: BookingApprovalData) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({
    deposit_amount: agreement.deposit_amount ? String(agreement.deposit_amount) : '',
    advance_payment: '',
    pickup_mileage: '',
    mileage_limit_per_day: '',
    excess_mileage_rate: '',
    fuel_level_out: '',
    fuel_charge_rate: '',
  })

  const fields: { key: keyof BookingApprovalData; label: string; step?: string; max?: number }[] = [
    { key: 'deposit_amount', label: t('agreementActions.depositRequired'), step: '0.01' },
    { key: 'advance_payment', label: t('agreementActions.advanceRequired'), step: '0.01' },
    { key: 'pickup_mileage', label: t('agreementActions.pickupMileage') },
    { key: 'mileage_limit_per_day', label: t('agreementActions.mileageAllowance') },
    { key: 'excess_mileage_rate', label: t('agreementActions.excessMileageRate'), step: '0.01' },
    { key: 'fuel_level_out', label: t('agreementActions.fuelLevelOut'), max: 100 },
    { key: 'fuel_charge_rate', label: t('agreementActions.fuelChargeRate'), step: '0.01' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // Send only what was filled in; an omitted term stays unset rather
          // than being recorded as a zero allowance.
          const payload: BookingApprovalData = {}
          for (const { key } of fields) {
            const raw = values[key]?.trim()
            if (!raw) continue
            const parsed = Number.parseFloat(raw)
            if (Number.isFinite(parsed)) payload[key] = parsed
          }
          onSubmit(payload)
        }}
        className="my-8 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          {t('agreementActions.confirmTerms')}
        </h2>
        <p className="mb-4 text-sm text-gray-500">{t('agreementActions.confirmTermsHint')}</p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, step, max }) => (
            <div key={key}>
              <label
                htmlFor={`approval-${key}`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                {label}
              </label>
              <input
                id={`approval-${key}`}
                type="number"
                min={0}
                max={max}
                step={step ?? '1'}
                value={values[key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-yellow-600 px-4 py-2 text-sm text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            {isLoading ? t('common.loading') : t('agreementActions.approveBooking')}
          </button>
        </div>
      </form>
    </div>
  )
}
