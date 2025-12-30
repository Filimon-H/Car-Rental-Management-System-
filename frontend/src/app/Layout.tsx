import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home,
  FileText,
  Users,
  Car,
  Building2,
  Heart,
  ClipboardList,
  DollarSign,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  ChevronDown,
  UserCheck,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '@/services/auth'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Dashboard' },
  { path: '/agreements', icon: FileText, label: 'Agreements' },
  { path: '/agreements/wedding', icon: Heart, label: 'Wedding' },
  { path: '/customers', icon: Users, label: 'Customers' },
  { path: '/vehicles', icon: Car, label: 'Vehicles' },
  { path: '/vendors', icon: Building2, label: 'Vendors' },
  { path: '/drivers', icon: UserCheck, label: 'Drivers' },
  { path: '/collaterals', icon: Shield, label: 'Collaterals' },
  { path: '/inspections', icon: ClipboardList, label: 'Inspections' },
  { path: '/ledger', icon: DollarSign, label: 'Ledger' },
]

export default function Layout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
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

  const languages = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'am', label: 'አማርኛ', flag: '🇪🇹' },
  ]

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0]

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } flex flex-col bg-gray-900 text-white transition-all duration-300`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4">
          {sidebarOpen && (
            <span className="text-xl font-bold text-primary">CarRental</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 hover:bg-gray-800"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>{t(`nav.${item.label.toLowerCase()}`, item.label)}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-800 p-4">
          {sidebarOpen && user && (
            <div className="mb-3 text-sm">
              <div className="font-medium">{user.full_name}</div>
              <div className="text-gray-400">{user.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            {sidebarOpen && <span>{t('nav.logout', 'Logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-800">
              {t('app.title', 'Car Rental Management')}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Language Toggle */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              >
                <Globe className="h-4 w-4" />
                <span>{currentLang.flag} {currentLang.label}</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {langMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setLangMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-40 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 ${
                          i18n.language === lang.code ? 'bg-gray-50 font-medium' : ''
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Settings */}
            <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
