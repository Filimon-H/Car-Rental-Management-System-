import { useTranslation } from 'react-i18next'

export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar placeholder */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-sidebar text-white">
        <div className="flex h-16 items-center px-6">
          <span className="text-xl font-bold">{t('common.appName')}</span>
        </div>
        <nav className="mt-6 px-4">
          <a
            href="/dashboard"
            className="flex items-center rounded-lg bg-primary px-4 py-3 text-white"
          >
            {t('nav.dashboard')}
          </a>
          {/* More nav items will be added */}
        </nav>
      </aside>

      {/* Main content */}
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>
          <p className="text-gray-600">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Stats cards placeholder */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-500">{t('dashboard.income')}</h3>
            <p className="mt-2 text-3xl font-bold text-gray-800">$0.00</p>
            <p className="mt-1 text-sm text-gray-500">Today</p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-500">{t('dashboard.expenses')}</h3>
            <p className="mt-2 text-3xl font-bold text-gray-800">$0.00</p>
            <p className="mt-1 text-sm text-gray-500">Today</p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-500">Active Rentals</h3>
            <p className="mt-2 text-3xl font-bold text-gray-800">0</p>
            <p className="mt-1 text-sm text-gray-500">Vehicles out</p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-sm font-medium text-gray-500">Due Today</h3>
            <p className="mt-2 text-3xl font-bold text-gray-800">0</p>
            <p className="mt-1 text-sm text-gray-500">Returns expected</p>
          </div>
        </div>

        {/* Placeholder content */}
        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-800">
            {t('dashboard.liveStatus')}
          </h2>
          <p className="mt-4 text-gray-500">
            Dashboard content will be implemented in User Story 6.
          </p>
        </div>
      </main>
    </div>
  )
}
