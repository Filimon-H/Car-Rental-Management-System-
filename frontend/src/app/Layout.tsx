import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import {
  Building2,
  Car,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  DollarSign,
  FileText,
  Globe,
  Heart,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/services/auth'
import apiClient from '@/services/apiClient'
import { useTheme } from '@/hooks/useTheme'

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      apiClient.post('/me/change-password', data),
    onSuccess: () => onClose(),
    onError: (err: Error) => setError(err.message || 'Failed to change password'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    mutation.mutate({ current_password: currentPassword, new_password: newPassword })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Labels are translation keys, resolved at render time — a module-level
// constant cannot call t(), and holding English here left the sidebar in
// English whatever language was selected.
const navGroups = [
  {
    label: 'nav.overview',
    items: [{ path: '/dashboard', icon: Home, label: 'nav.dashboard', adminOnly: false }],
  },
  {
    label: 'nav.rentals',
    items: [
      { path: '/agreements', icon: FileText, label: 'nav.agreements', adminOnly: false },
      { path: '/agreements/wedding', icon: Heart, label: 'nav.wedding', adminOnly: false },
    ],
  },
  {
    label: 'nav.fleetAndPeople',
    items: [
      { path: '/vehicles', icon: Car, label: 'nav.vehicles', adminOnly: false },
      { path: '/drivers', icon: UserCheck, label: 'nav.drivers', adminOnly: false },
      { path: '/customers', icon: Users, label: 'nav.customers', adminOnly: false },
      { path: '/vendors', icon: Building2, label: 'nav.vendors', adminOnly: false },
      { path: '/collaterals', icon: Shield, label: 'nav.collaterals', adminOnly: false },
    ],
  },
  {
    label: 'nav.financeAndOps',
    items: [
      { path: '/ledger', icon: DollarSign, label: 'nav.ledger', adminOnly: false },
      { path: '/inspections', icon: ClipboardList, label: 'nav.inspections', adminOnly: false },
      { path: '/admin/users', icon: UserCog, label: 'nav.userManagement', adminOnly: true },
      { path: '/admin/lookups', icon: Settings, label: 'nav.adminSettings', adminOnly: true },
    ],
  },
]

/** Returns a translation key; the caller resolves it with t(). */
function getPageTitleKey(pathname: string): string {
  if (pathname === '/dashboard') return 'nav.dashboard'
  if (pathname.startsWith('/agreements/wedding/new')) return 'pageTitle.newWeddingAgreement'
  if (pathname.startsWith('/agreements/wedding')) return 'pageTitle.weddingAgreements'
  if (pathname.startsWith('/agreements/new') || pathname === '/agreements/new') return 'pageTitle.newAgreement'
  if (pathname.startsWith('/agreements/') && pathname.endsWith('/print')) return 'pageTitle.printAgreement'
  if (pathname.startsWith('/agreements/')) return 'pageTitle.agreementDetails'
  if (pathname === '/agreements') return 'nav.agreements'
  if (pathname.startsWith('/customers/new')) return 'pageTitle.newCustomer'
  if (pathname.includes('/collaterals/new')) return 'pageTitle.newCollateral'
  if (pathname.includes('/collaterals/') && pathname.endsWith('/edit')) return 'collateralDetail.editCollateral'
  if (pathname.includes('/collaterals/')) return 'collateralDetail.title'
  if (pathname.startsWith('/customers/') && pathname.endsWith('/edit')) return 'customerDetail.editCustomer'
  if (pathname.startsWith('/customers/')) return 'customerDetail.title'
  if (pathname === '/customers') return 'nav.customers'
  if (pathname.startsWith('/vehicles/new') || pathname === '/vehicles/new') return 'pageTitle.addVehicle'
  if (pathname.startsWith('/vehicles/') && pathname.endsWith('/edit')) return 'pageTitle.editVehicle'
  if (pathname.startsWith('/vehicles/')) return 'pageTitle.vehicleDetails'
  if (pathname === '/vehicles') return 'nav.vehicles'
  if (pathname === '/vendors') return 'nav.vendors'
  if (pathname === '/drivers') return 'nav.drivers'
  if (pathname === '/collaterals') return 'nav.collaterals'
  if (pathname.startsWith('/collaterals')) return 'nav.collaterals'
  if (pathname === '/ledger') return 'nav.ledger'
  if (pathname === '/inspections') return 'nav.inspections'
  if (pathname === '/admin/users') return 'nav.userManagement'
  if (pathname.startsWith('/admin')) return 'nav.adminSettings'
  return 'brand.fleetOps'
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold text-white dark:bg-orange-brand">
      {initials}
    </div>
  )
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { isDark, toggle: toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang)
    setLangMenuOpen(false)
  }

  const handleNavClick = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }

  const languages = [
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'am', label: 'አማርኛ', flag: 'AM' },
  ]

  const currentLang = languages.find((item) => item.code === i18n.language) || languages[0]
  const pageTitle = t(getPageTitleKey(location.pathname))
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date())

  return (
    <div className="flex min-h-screen bg-transparent">
      {/* Visible only on keyboard focus: lets keyboard and screen-reader users jump
          past the sidebar instead of tabbing through every nav link on each page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/40 transition-opacity lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col overflow-hidden transition-all duration-300 ${
          isDark ? 'bg-brand' : 'bg-slate-900'
        } text-white ${
          sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-[76px] lg:translate-x-0'
        } w-64`}
      >
        <div
          className={`flex h-16 items-center border-b ${isDark ? 'border-white/10' : 'border-white/10'} ${
            sidebarOpen ? 'justify-between px-4' : 'justify-center px-3'
          }`}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isDark ? 'bg-orange-brand' : 'bg-primary'}`}>
                  <Car className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold tracking-tight text-white">FleetOps</p>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDark ? 'text-night-subtle' : 'text-slate-500'}`}>Admin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${isDark ? 'bg-orange-brand' : 'bg-primary'}`}
            >
              <Car className="h-4.5 w-4.5 text-white" />
            </button>
          )}
        </div>

        <div className="border-b border-white/10 px-3 py-4">
          {sidebarOpen ? (
            <button
              type="button"
              onClick={() => navigate('/agreements/new')}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
                isDark ? 'bg-orange-brand hover:bg-orange-dark' : 'bg-primary hover:bg-primary-700'
              }`}
            >
              <FileText className="h-4 w-4" />
              {t('nav.newAgreement')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/agreements/new')}
              className={`flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-white ${
                isDark ? 'bg-orange-brand' : 'bg-primary'
              }`}
              title={t('nav.newAgreement')}
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.adminOnly || user?.role === 'admin'
            )
            if (visibleItems.length === 0) return null
            return (
            <div key={group.label} className="mb-4">
              {sidebarOpen && (
                <p className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] ${isDark ? 'text-night-subtle/60' : 'text-slate-500'}`}>
                  {t(group.label)}
                </p>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    title={!sidebarOpen ? t(item.label) : undefined}
                    className={({ isActive }) =>
                      `flex items-center rounded-xl transition-colors ${
                        sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-3'
                      } ${
                        isActive
                          ? isDark
                            ? 'bg-orange-brand/20 text-orange-brand'
                            : 'bg-white/10 text-white'
                          : isDark
                          ? 'text-white/60 hover:bg-white/10 hover:text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {sidebarOpen && (
                      <span className="truncate text-sm font-medium">
                        {t(item.label)}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {sidebarOpen && user ? (
            <div className={`flex items-center gap-3 rounded-xl px-3 py-3 ${isDark ? 'bg-black/20' : 'bg-white/5'}`}>
              <UserAvatar name={user.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
                <p className={`truncate text-xs capitalize ${isDark ? 'text-night-subtle/70' : 'text-slate-400'}`}>{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-xl p-2.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      <div className={`flex flex-1 flex-col transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-[76px]'}`}>
        <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 lg:px-8">
          <div className="app-panel flex min-h-[72px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                  {todayLabel}
                </p>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Dark mode toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-night-border dark:bg-night-raised dark:text-orange-brand dark:hover:bg-night-hover"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLangMenuOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Globe className="h-4 w-4 text-primary" />
                  <span>{currentLang.flag}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>

                {langMenuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close language menu"
                      className="fixed inset-0 z-10"
                      onClick={() => setLangMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      {languages.map((lang) => (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => changeLanguage(lang.code)}
                          className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors ${
                            i18n.language === lang.code
                              ? 'bg-slate-50 font-medium text-primary'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{lang.label}</span>
                          <span className="text-xs font-medium text-slate-400">{lang.flag}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {user && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <UserAvatar name={user.full_name} />
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-medium text-slate-800">{user.full_name}</p>
                      <p className="text-xs capitalize text-slate-400">{user.role}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>

                  {userMenuOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close user menu"
                        className="fixed inset-0 z-10"
                        onClick={() => setUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => { setUserMenuOpen(false); setShowChangePassword(true) }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <KeyRound className="h-4 w-4 text-slate-400" />
                          Change Password
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUserMenuOpen(false); handleLogout() }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          {/* Scoped to the route so a page that throws leaves the nav and header
              usable, and navigating away clears the error. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  )
}
