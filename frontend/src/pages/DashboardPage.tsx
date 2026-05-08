import { type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/hooks/use-toast'
import { dashboardService } from '@/services/dashboard'
import { telegramService } from '@/services/telegram'

const toneMap = {
  primary: 'bg-primary text-white',
  danger: 'bg-red-50 text-red-700 border border-red-100',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border border-amber-100',
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', maximumFractionDigits: 0 }).format(value)
}

function formatDateLabel(value?: string | null) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function getInitials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusMap[status] || statusMap.draft
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
    </span>
  )
}

function StatCard({
  title, value, detail, icon, tone = 'neutral', onClick,
}: {
  title: string; value: number | string; detail: string; icon: ReactNode
  tone?: keyof typeof toneMap; onClick?: () => void
}) {
  const card = (
    <div className={`rounded-2xl p-5 shadow-sm transition-all hover:shadow-md ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${tone === 'primary' ? 'text-blue-100' : 'text-slate-400'}`}>
            {title}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
          <p className={`mt-2 text-sm ${
            tone === 'primary' ? 'text-blue-100'
            : tone === 'danger' ? 'text-red-600'
            : tone === 'success' ? 'text-emerald-600'
            : tone === 'warning' ? 'text-amber-600'
            : 'text-slate-500'
          }`}>
            {detail}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone === 'primary' ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`}>
          {icon}
        </div>
      </div>
    </div>
  )
  if (!onClick) return card
  return <button type="button" onClick={onClick} className="text-left">{card}</button>
}

function QuickAction({ title, description, icon, onClick }: { title: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>
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

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardService.getStats(),
    refetchInterval: 60_000,
  })

  const { data: telegramStatus, isLoading: isTelegramLoading } = useQuery({
    queryKey: ['me', 'telegram'],
    queryFn: () => telegramService.getStatus(),
  })

  const createLinkCodeMutation = useMutation({
    mutationFn: () => telegramService.createLinkCode(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'telegram'] })
      toast({ title: 'Telegram link code ready', description: 'Open the bot and send /link with the code shown on this page.' })
    },
    onError: () => toast({ title: 'Could not generate Telegram code', description: 'Please log in again and retry.', variant: 'destructive' }),
  })

  const unlinkTelegramMutation = useMutation({
    mutationFn: () => telegramService.unlink(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'telegram'] })
      toast({ title: 'Telegram link removed' })
    },
    onError: () => toast({ title: 'Could not remove Telegram link', variant: 'destructive' }),
  })

  const activeLinkCode = createLinkCodeMutation.data
  const botUsername = activeLinkCode?.bot_username || telegramStatus?.bot_username
  const botLink = botUsername ? `https://t.me/${botUsername}` : null

  const handleCopyLinkCode = async () => {
    if (!activeLinkCode?.code) return
    try {
      await navigator.clipboard.writeText(activeLinkCode.code)
      toast({ title: 'Code copied', description: 'Paste it into Telegram as /link CODE.' })
    } catch {
      toast({ title: 'Could not copy code', variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 page-fade">
      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Could not load dashboard data. Check your connection or refresh the page.
        </div>
      )}

      {/* Header */}
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
            <button type="button" onClick={() => navigate('/agreements/new')}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
              <Plus className="h-4 w-4" />
              {t('dashboard.newAgreement')}
            </button>
            <button type="button" onClick={() => navigate('/vehicles/new')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              {t('dashboard.addVehicle')}
            </button>
          </div>
        </div>
      </section>

      {/* Primary agreement stats */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t('dashboard.activeAgreements')} value={stats?.active_agreements ?? 0}
          detail={t('dashboard.currentlyRented')} icon={<FileText className="h-5 w-5" />} tone="primary"
          onClick={() => navigate('/agreements?status=active')} />
        <StatCard title={t('dashboard.overdueReturns')} value={stats?.overdue_agreements ?? 0}
          detail={(stats?.overdue_agreements ?? 0) > 0 ? t('dashboard.needsAttention') : t('dashboard.allOnTime')}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={(stats?.overdue_agreements ?? 0) > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/agreements?status=overdue')} />
        <StatCard title={t('dashboard.availableVehicles')} value={stats?.vehicles.available ?? 0}
          detail={t('dashboard.ofTotal', { total: stats?.vehicles.total ?? 0 })}
          icon={<Car className="h-5 w-5" />} onClick={() => navigate('/vehicles?status=available')} />
        <StatCard title={t('dashboard.totalCustomers')} value={stats?.total_customers ?? 0}
          detail={t('dashboard.registeredCustomers')} icon={<Users className="h-5 w-5" />}
          onClick={() => navigate('/customers')} />
      </section>

      {/* Revenue row */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-emerald-600 p-5 text-white shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">This Month</p>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {formatCurrency(stats?.revenue.collected_this_month ?? 0)}
              </p>
              <p className="mt-2 text-sm text-emerald-100">Collected in payments</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Outstanding</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-red-700">
                {formatCurrency(stats?.revenue.outstanding_balance ?? 0)}
              </p>
              <p className="mt-2 text-sm text-red-600">Across active &amp; overdue</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">All Time</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                {formatCurrency(stats?.revenue.total_all_time ?? 0)}
              </p>
              <p className="mt-2 text-sm text-slate-500">Total payments received</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Main content grid */}
      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left: Quick actions */}
        <div className="space-y-4">
          <div className="app-panel p-5">
            <div className="mb-4">
              <p className="app-kicker">{t('dashboard.quickActions')}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{t('dashboard.commonTasks')}</h3>
            </div>
            <div className="space-y-3">
              <QuickAction title={t('dashboard.newAgreement')} description={t('dashboard.createStandardRental')}
                icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/agreements/new')} />
              <QuickAction title={t('dashboard.weddingAgreement')} description={t('dashboard.startWeddingRental')}
                icon={<Calendar className="h-4 w-4" />} onClick={() => navigate('/agreements/wedding/new')} />
              <QuickAction title={t('dashboard.addCustomer')} description={t('dashboard.registerNewCustomer')}
                icon={<Users className="h-4 w-4" />} onClick={() => navigate('/customers/new')} />
              <QuickAction title={t('dashboard.addVehicle')} description={t('dashboard.addVehicleToFleet')}
                icon={<Car className="h-4 w-4" />} onClick={() => navigate('/vehicles/new')} />
            </div>
          </div>

          {/* Fleet mini-summary */}
          <div className="app-panel p-5">
            <p className="app-kicker mb-3">Fleet Status</p>
            <div className="space-y-3">
              {[
                { label: 'Available', value: stats?.vehicles.available ?? 0, color: 'bg-emerald-500' },
                { label: 'Rented', value: stats?.vehicles.rented ?? 0, color: 'bg-blue-500' },
                { label: 'Maintenance', value: stats?.vehicles.maintenance ?? 0, color: 'bg-amber-500' },
              ].map(({ label, value, color }) => {
                const total = stats?.vehicles.total || 1
                const pct = Math.round((value / total) * 100)
                return (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-slate-500">{value} / {total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Recent agreements */}
        <div className="app-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="app-kicker">{t('dashboard.recentAgreements')}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('dashboard.latestActivity')}</h3>
            </div>
            <button type="button" onClick={() => navigate('/agreements')}
              className="text-sm font-medium text-primary transition-colors hover:text-primary-700">
              {t('dashboard.viewAll')}
            </button>
          </div>
          {!stats?.recent_agreements.length ? (
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
                  {stats.recent_agreements.map((a) => (
                    <tr key={a.id} onClick={() => navigate(`/agreements/${a.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">{a.agreement_number}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {getInitials(a.customer_name || 'NA')}
                          </div>
                          <span className="text-sm text-slate-700">{a.customer_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDateLabel(a.expected_return_datetime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Secondary stats row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t('dashboard.vehiclesRented')} value={stats?.vehicles.rented ?? 0}
          detail={t('dashboard.currentlyOut')} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard title={t('dashboard.dueToday')} value={stats?.due_today ?? 0}
          detail={t('dashboard.returnsExpectedToday')} icon={<Clock className="h-5 w-5" />}
          tone={(stats?.due_today ?? 0) > 0 ? 'warning' : 'neutral'} />
        <StatCard title={t('dashboard.inMaintenance')} value={stats?.vehicles.maintenance ?? 0}
          detail={t('dashboard.vehiclesUnavailable')} icon={<Wrench className="h-5 w-5" />}
          onClick={() => navigate('/vehicles?status=maintenance')} />
        <StatCard title={t('dashboard.allAgreements')} value={stats?.total_agreements ?? 0}
          detail={t('dashboard.totalRecords')} icon={<FileText className="h-5 w-5" />}
          onClick={() => navigate('/agreements')} />
      </section>

      {/* Alerts */}
      {((stats?.overdue_agreements ?? 0) > 0 || (stats?.due_today ?? 0) > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {(stats?.overdue_agreements ?? 0) > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-red-800">{t('dashboard.overdueAgreementsWarning')}</h3>
                  <p className="mt-1 text-sm text-red-700">
                    {t('dashboard.overdueAgreementsDesc', { count: stats?.overdue_agreements })}
                  </p>
                  <button type="button" onClick={() => navigate('/agreements?status=overdue')}
                    className="mt-3 text-sm font-medium text-red-800 hover:text-red-900">
                    {t('dashboard.reviewOverdue')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {(stats?.due_today ?? 0) > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800">{t('dashboard.returnsDueToday')}</h3>
                  <p className="mt-1 text-sm text-amber-700">
                    {t('dashboard.returnsDueTodayDesc', { count: stats?.due_today })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Telegram — collapsed at bottom, not dominating the page */}
      <section>
        <details className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-sky-50/50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Bot className="h-4 w-4" />
              </div>
              <span>Telegram Bot Notifications</span>
              {telegramStatus?.linked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Linked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Not linked
                </span>
              )}
            </div>
          </summary>

          <div className="border-t border-sky-100 p-5 space-y-4">
            <p className="text-sm text-slate-600">
              Link your staff account to receive overdue alerts and use the bot for customer/vehicle lookups.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isTelegramLoading ? 'Checking…' : telegramStatus?.linked
                    ? `Linked as @${telegramStatus.telegram_username ?? 'unknown'}`
                    : 'Not linked yet'}
                </p>
                {telegramStatus?.linked_at && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" />
                    Since {formatDateTimeLabel(telegramStatus.linked_at)}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-slate-900 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bot</p>
                <p className="mt-2 text-sm font-semibold">{botUsername ? `@${botUsername}` : 'Not configured'}</p>
                {botLink && (
                  <a href={botLink} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200">
                    Open in Telegram <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => createLinkCodeMutation.mutate()}
                disabled={createLinkCodeMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${createLinkCodeMutation.isPending ? 'animate-spin' : ''}`} />
                {activeLinkCode ? 'Refresh code' : 'Generate code'}
              </button>
              {telegramStatus?.linked && (
                <button type="button" onClick={() => unlinkTelegramMutation.mutate()}
                  disabled={unlinkTelegramMutation.isPending}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  Remove link
                </button>
              )}
            </div>

            {activeLinkCode && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Your code</p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-slate-900">
                      {activeLinkCode.code}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Expires {formatDateTimeLabel(activeLinkCode.expires_at)}</p>
                  </div>
                  <button type="button" onClick={handleCopyLinkCode}
                    className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
      </section>
    </div>
  )
}
