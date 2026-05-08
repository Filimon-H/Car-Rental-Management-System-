import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  LogOut,
  Menu,
  Settings,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/services/auth'

const navGroups = [
  {
    label: 'Overview',
    items: [{ path: '/dashboard', icon: Home, label: 'Dashboard' }],
  },
  {
    label: 'Rentals',
    items: [
      { path: '/agreements', icon: FileText, label: 'Agreements' },
      { path: '/agreements/wedding', icon: Heart, label: 'Wedding' },
    ],
  },
  {
    label: 'Fleet & People',
    items: [
      { path: '/vehicles', icon: Car, label: 'Vehicles' },
      { path: '/drivers', icon: UserCheck, label: 'Drivers' },
      { path: '/customers', icon: Users, label: 'Customers' },
      { path: '/vendors', icon: Building2, label: 'Vendors' },
      { path: '/collaterals', icon: Shield, label: 'Collaterals' },
    ],
  },
  {
    label: 'Finance & Ops',
    items: [
      { path: '/ledger', icon: DollarSign, label: 'Ledger' },
      { path: '/inspections', icon: ClipboardList, label: 'Inspections' },
      { path: '/admin/lookups', icon: Settings, label: 'Admin Settings' },
    ],
  },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname.startsWith('/agreements/wedding/new')) return 'New Wedding Agreement'
  if (pathname.startsWith('/agreements/wedding')) return 'Wedding Agreements'
  if (pathname.startsWith('/agreements/new') || pathname === '/agreements/new') return 'New Agreement'
  if (pathname.startsWith('/agreements/') && pathname.endsWith('/print')) return 'Print Agreement'
  if (pathname.startsWith('/agreements/')) return 'Agreement Details'
  if (pathname === '/agreements') return 'Agreements'
  if (pathname.startsWith('/customers/new')) return 'New Customer'
  if (pathname.includes('/collaterals/new')) return 'New Collateral'
  if (pathname.includes('/collaterals/') && pathname.endsWith('/edit')) return 'Edit Collateral'
  if (pathname.includes('/collaterals/')) return 'Collateral Details'
  if (pathname.startsWith('/customers/') && pathname.endsWith('/edit')) return 'Edit Customer'
  if (pathname.startsWith('/customers/')) return 'Customer Details'
  if (pathname === '/customers') return 'Customers'
  if (pathname.startsWith('/vehicles/new') || pathname === '/vehicles/new') return 'Add Vehicle'
  if (pathname.startsWith('/vehicles/') && pathname.endsWith('/edit')) return 'Edit Vehicle'
  if (pathname.startsWith('/vehicles/')) return 'Vehicle Details'
  if (pathname === '/vehicles') return 'Vehicles'
  if (pathname === '/vendors') return 'Vendors'
  if (pathname === '/drivers') return 'Drivers'
  if (pathname === '/collaterals') return 'Collaterals'
  if (pathname.startsWith('/collaterals')) return 'Collaterals'
  if (pathname === '/ledger') return 'Ledger'
  if (pathname === '/inspections') return 'Inspections'
  if (pathname.startsWith('/admin')) return 'Admin Settings'
  return 'FleetOps'
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold text-white">
      {initials}
    </div>
  )
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [langMenuOpen, setLangMenuOpen] = useState(false)

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
  const pageTitle = getPageTitle(location.pathname)
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date())

  return (
    <div className="flex min-h-screen bg-transparent">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/40 transition-opacity lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col overflow-hidden bg-slate-900 text-white transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-[76px] lg:translate-x-0'
        } w-64`}
      >
        <div
          className={`flex h-16 items-center border-b border-white/10 ${
            sidebarOpen ? 'justify-between px-4' : 'justify-center px-3'
          }`}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                  <Car className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold tracking-tight text-white">FleetOps</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Admin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              <FileText className="h-4 w-4" />
              New Agreement
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/agreements/new')}
              className="flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-white"
              title="New Agreement"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              {sidebarOpen && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    title={!sidebarOpen ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center rounded-xl transition-colors ${
                        sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-3'
                      } ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {sidebarOpen && (
                      <span className="truncate text-sm font-medium">
                        {t(`nav.${item.label.toLowerCase().replace(/\s+/g, '')}`, item.label)}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          {sidebarOpen && user ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
              <UserAvatar name={user.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
                <p className="truncate text-xs capitalize text-slate-400">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <UserAvatar name={user.full_name} />
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium text-slate-800">{user.full_name}</p>
                    <p className="text-xs capitalize text-slate-400">{user.role}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
