import { type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  Car,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/hooks/use-toast'
import { agreementsService, type Agreement } from '@/services/agreements'
import { customersService } from '@/services/customers'
import { telegramService } from '@/services/telegram'
import { vehiclesService, type Vehicle } from '@/services/vehicles'

const toneMap = {
  primary: 'bg-primary text-white',
  danger: 'bg-red-50 text-red-700 border border-red-100',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  neutral: 'bg-white text-slate-900 border border-slate-200',
}

const statusMap: Record<string, { dot: string; text: string; bg: string }> = {
  draft: { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' },
  pending_payment: { dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  active: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  returned: { dot: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
  closed: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  overdue: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  cancelled: { dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50' },
}

function formatDateLabel(value?: string) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusMap[status] || statusMap.draft
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function StatCard({
  title,
  value,
  detail,
  icon,
  tone = 'neutral',
  onClick,
}: {
  title: string
  value: number | string
  detail: string
  icon: ReactNode
  tone?: keyof typeof toneMap
  onClick?: () => void
}) {
  const card = (
    <div className={`rounded-2xl p-5 shadow-sm transition-all hover:shadow-md ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              tone === 'primary' ? 'text-blue-100' : 'text-slate-400'
            }`}
          >
            {title}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
          <p
            className={`mt-2 text-sm ${
              tone === 'primary'
                ? 'text-blue-100'
                : tone === 'danger'
                  ? 'text-red-600'
                  : tone === 'success'
                    ? 'text-emerald-600'
                    : 'text-slate-500'
            }`}
          >
            {detail}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            tone === 'primary' ? 'bg-white/15' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  )

  if (!onClick) return card
  return (
    <button type="button" onClick={onClick} className="text-left">
      {card}
    </button>
  )
}

function QuickAction({
  title,
  description,
  icon,
  onClick,
}: {
  title: string
  description: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300" />
    </button>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const { data: agreementsData, isError: agreementsError } = useQuery({
    queryKey: ['agreements', 'all'],
    queryFn: () => agreementsService.list({ page_size: 100 }),
  })
  const { data: activeAgreements } = useQuery({
    queryKey: ['agreements', 'active'],
    queryFn: () => agreementsService.list({ status: 'active', page_size: 100 }),
  })
  const { data: overdueAgreements } = useQuery({
    queryKey: ['agreements', 'overdue'],
    queryFn: () => agreementsService.list({ status: 'overdue', page_size: 100 }),
  })
  const { data: vehiclesData, isError: vehiclesError } = useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: () => vehiclesService.list({ page_size: 100 }),
  })
  const { data: customersData, isError: customersError } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customersService.list({ page_size: 100 }),
  })
  const hasDataError = agreementsError || vehiclesError || customersError
  const { data: telegramStatus, isLoading: isTelegramLoading } = useQuery({
    queryKey: ['me', 'telegram'],
    queryFn: () => telegramService.getStatus(),
  })

  const createLinkCodeMutation = useMutation({
    mutationFn: () => telegramService.createLinkCode(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'telegram'] })
      toast({
        title: 'Telegram link code ready',
        description: 'Open the bot and send /link with the code shown on this page.',
      })
    },
    onError: () => {
      toast({
        title: 'Could not generate Telegram code',
        description: 'Please log in again and retry.',
        variant: 'destructive',
      })
    },
  })

  const unlinkTelegramMutation = useMutation({
    mutationFn: () => telegramService.unlink(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'telegram'] })
      toast({
        title: 'Telegram link removed',
        description: 'You can generate a new code whenever you need to reconnect.',
      })
    },
    onError: () => {
      toast({
        title: 'Could not remove Telegram link',
        description: 'Please retry in a moment.',
        variant: 'destructive',
      })
    },
  })

  const totalAgreements = agreementsData?.total || 0
  const activeCount = activeAgreements?.total || 0
  const overdueCount = overdueAgreements?.total || 0
  const totalVehicles = vehiclesData?.total || 0
  const totalCustomers = customersData?.total || 0

  const vehicles = vehiclesData?.items || []
  const availableVehicles = vehicles.filter((vehicle: Vehicle) => vehicle.status === 'available').length
  const rentedVehicles = vehicles.filter((vehicle: Vehicle) => vehicle.status === 'rented').length
  const maintenanceVehicles = vehicles.filter(
    (vehicle: Vehicle) => vehicle.status === 'maintenance'
  ).length
  const recentAgreements = agreementsData?.items?.slice(0, 5) || []

  // Use local date (not UTC) so "today" matches the business timezone
  const todayLocal = new Intl.DateTimeFormat('en-CA').format(new Date()) // YYYY-MM-DD in local tz
  const dueToday =
    activeAgreements?.items?.filter((agreement: Agreement) => {
      if (!agreement.expected_return_datetime) return false
      const returnLocal = new Intl.DateTimeFormat('en-CA').format(
        new Date(agreement.expected_return_datetime)
      )
      return returnLocal === todayLocal
    }) || []
  const activeLinkCode = createLinkCodeMutation.data
  const botUsername = activeLinkCode?.bot_username || telegramStatus?.bot_username
  const botLink = botUsername ? `https://t.me/${botUsername}` : null

  const handleCopyLinkCode = async () => {
    if (!activeLinkCode?.code) return
    try {
      await navigator.clipboard.writeText(activeLinkCode.code)
      toast({
        title: 'Code copied',
        description: 'Paste it into Telegram as /link CODE.',
      })
    } catch {
      toast({
        title: 'Could not copy code',
        description: 'Copy the code manually from the dashboard.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 page-fade">
      {hasDataError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Could not load some dashboard data. Check your connection or refresh the page.
        </div>
      )}
      <section className="app-panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="app-kicker">{t('dashboard.overview')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {t('dashboard.fleetOperations')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {t('dashboard.fleetOperationsDesc')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/agreements/new')}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              {t('dashboard.newAgreement')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/vehicles/new')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t('dashboard.addVehicle')}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('dashboard.activeAgreements')}
          value={activeCount}
          detail={t('dashboard.currentlyRented')}
          icon={<FileText className="h-5 w-5" />}
          tone="primary"
          onClick={() => navigate('/agreements?status=active')}
        />
        <StatCard
          title={t('dashboard.overdueReturns')}
          value={overdueCount}
          detail={overdueCount > 0 ? t('dashboard.needsAttention') : t('dashboard.allOnTime')}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={overdueCount > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/agreements?status=overdue')}
        />
        <StatCard
          title={t('dashboard.availableVehicles')}
          value={availableVehicles}
          detail={t('dashboard.ofTotal', { total: totalVehicles })}
          icon={<Car className="h-5 w-5" />}
          onClick={() => navigate('/vehicles?status=available')}
        />
        <StatCard
          title={t('dashboard.totalCustomers')}
          value={totalCustomers}
          detail={t('dashboard.registeredCustomers')}
          icon={<Users className="h-5 w-5" />}
          onClick={() => navigate('/customers')}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="app-panel p-5">
            <div className="mb-4">
              <p className="app-kicker">{t('dashboard.quickActions')}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{t('dashboard.commonTasks')}</h3>
            </div>
            <div className="space-y-3">
              <QuickAction
                title={t('dashboard.newAgreement')}
                description={t('dashboard.createStandardRental')}
                icon={<Plus className="h-4 w-4" />}
                onClick={() => navigate('/agreements/new')}
              />
              <QuickAction
                title={t('dashboard.weddingAgreement')}
                description={t('dashboard.startWeddingRental')}
                icon={<Calendar className="h-4 w-4" />}
                onClick={() => navigate('/agreements/wedding/new')}
              />
              <QuickAction
                title={t('dashboard.addCustomer')}
                description={t('dashboard.registerNewCustomer')}
                icon={<Users className="h-4 w-4" />}
                onClick={() => navigate('/customers/new')}
              />
              <QuickAction
                title={t('dashboard.addVehicle')}
                description={t('dashboard.addVehicleToFleet')}
                icon={<Car className="h-4 w-4" />}
                onClick={() => navigate('/vehicles/new')}
              />
            </div>
          </div>

          <div id="telegram-link" className="overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sm">
            <div className="border-b border-sky-100 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="app-kicker text-sky-500">Telegram Bot</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">Staff notifications and lookup</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Link your staff account once, then use the bot for overdue alerts, customer search, and vehicle lookup.
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Bot className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Connection</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {isTelegramLoading
                          ? 'Checking status...'
                          : telegramStatus?.linked
                            ? 'Telegram is linked to your staff account'
                            : 'Telegram is not linked yet'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {telegramStatus?.linked && telegramStatus.telegram_username
                          ? `Linked as @${telegramStatus.telegram_username}`
                          : 'Generate a code below and send it to the bot to activate your account.'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                        telegramStatus?.linked
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          telegramStatus?.linked ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      {telegramStatus?.linked ? 'Linked' : 'Pending'}
                    </span>
                  </div>

                  {telegramStatus?.linked_at && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      Linked on {formatDateTimeLabel(telegramStatus.linked_at)}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/80 bg-slate-950 p-4 text-white shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/80">Bot Link</p>
                      <p className="mt-2 text-base font-semibold">
                        {botUsername ? `@${botUsername}` : 'Telegram bot unavailable'}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        Open the bot, tap Start, then send <span className="font-semibold text-white">/link YOUR_CODE</span>.
                      </p>
                    </div>
                    {botLink && (
                      <a
                        href={botLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                      >
                        Open Bot
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
                    Web link: <span className="font-medium text-white">{botLink || 'Not configured'}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">One-time code</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Generate a fresh code from the web whenever you want to link or relink Telegram.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => createLinkCodeMutation.mutate()}
                        disabled={createLinkCodeMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw className={`h-4 w-4 ${createLinkCodeMutation.isPending ? 'animate-spin' : ''}`} />
                        {activeLinkCode ? 'Refresh code' : 'Generate code'}
                      </button>
                      {telegramStatus?.linked && (
                        <button
                          type="button"
                          onClick={() => unlinkTelegramMutation.mutate()}
                          disabled={unlinkTelegramMutation.isPending}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove link
                        </button>
                      )}
                    </div>
                  </div>

                  {activeLinkCode ? (
                    <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">Current code</p>
                          <p className="mt-2 font-mono text-2xl font-bold tracking-[0.18em] text-slate-900">
                            {activeLinkCode.code}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyLinkCode}
                          className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Expires {formatDateTimeLabel(activeLinkCode.expires_at)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No active code yet. Generate one from this card, then message the bot with <span className="font-semibold text-slate-700">/link YOUR_CODE</span>.
                    </div>
                  )}

                  <div className="mt-4 grid gap-2 text-xs text-slate-500">
                    <p>1. Click <span className="font-semibold text-slate-700">Generate code</span>.</p>
                    <p>2. Open the Telegram bot from the link above.</p>
                    <p>3. Send <span className="font-semibold text-slate-700">/link YOUR_CODE</span> in chat.</p>
                    <p>4. After linking, use the bot for overdue reminders and quick staff lookups.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="app-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="app-kicker">{t('dashboard.recentAgreements')}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('dashboard.latestActivity')}</h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/agreements')}
              className="text-sm font-medium text-primary transition-colors hover:text-primary-700"
            >
              {t('dashboard.viewAll')}
            </button>
          </div>

          {recentAgreements.length === 0 ? (
            <div className="flex h-56 items-center justify-center px-6 text-sm text-slate-400">
              {t('dashboard.noAgreementsYet')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t('dashboard.agreement')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t('dashboard.customer')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t('dashboard.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t('dashboard.returnDate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentAgreements.map((agreement: Agreement) => (
                    <tr
                      key={agreement.id}
                      onClick={() => navigate(`/agreements/${agreement.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                        {agreement.agreement_number}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {getInitials(agreement.customer_name || 'NA')}
                          </div>
                          <span className="text-sm text-slate-700">{agreement.customer_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={agreement.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDateLabel(agreement.expected_return_datetime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('dashboard.vehiclesRented')}
          value={rentedVehicles}
          detail={t('dashboard.currentlyOut')}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title={t('dashboard.dueToday')}
          value={dueToday.length}
          detail={t('dashboard.returnsExpectedToday')}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title={t('dashboard.inMaintenance')}
          value={maintenanceVehicles}
          detail={t('dashboard.vehiclesUnavailable')}
          icon={<Wrench className="h-5 w-5" />}
        />
        <StatCard
          title={t('dashboard.allAgreements')}
          value={totalAgreements}
          detail={t('dashboard.totalRecords')}
          icon={<FileText className="h-5 w-5" />}
          onClick={() => navigate('/agreements')}
        />
      </section>

      {(overdueCount > 0 || dueToday.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {overdueCount > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-red-800">{t('dashboard.overdueAgreementsWarning')}</h3>
                  <p className="mt-1 text-sm text-red-700">
                    {t('dashboard.overdueAgreementsDesc', { count: overdueCount })}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/agreements?status=overdue')}
                    className="mt-3 text-sm font-medium text-red-800 hover:text-red-900"
                  >
                    {t('dashboard.reviewOverdue')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800">{t('dashboard.returnsDueToday')}</h3>
                  <p className="mt-1 text-sm text-amber-700">
                    {t('dashboard.returnsDueTodayDesc', { count: dueToday.length })}
                  </p>
                  <div className="mt-3 space-y-2">
                    {dueToday.slice(0, 3).map((agreement: Agreement) => (
                      <button
                        key={agreement.id}
                        type="button"
                        onClick={() => navigate(`/agreements/${agreement.id}`)}
                        className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {agreement.agreement_number}
                          </p>
                          <p className="text-xs text-slate-500">{agreement.customer_name}</p>
                        </div>
                        <span className="text-xs font-medium text-slate-400">
                          {formatDateLabel(agreement.expected_return_datetime)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
