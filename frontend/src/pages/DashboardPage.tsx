import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Car,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  TrendingUp,
  Calendar,
  DollarSign,
  Wrench,
} from 'lucide-react'
import { agreementsService, Agreement } from '@/services/agreements'
import { vehiclesService, Vehicle } from '@/services/vehicles'
import { customersService } from '@/services/customers'

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray'
  onClick?: () => void
}

function StatCard({ title, value, subtitle, icon, color, onClick }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  return (
    <div
      className={`rounded-xl border bg-white p-6 shadow-sm transition-all hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  )
}

interface QuickActionProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  color: string
}

function QuickAction({ title, description, icon, onClick, color }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md"
    >
      <div className={`rounded-lg p-3 ${color}`}>{icon}</div>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()

  // Fetch agreements
  const { data: agreementsData } = useQuery({
    queryKey: ['agreements', 'all'],
    queryFn: () => agreementsService.list({ page_size: 100 }),
  })

  // Fetch active agreements
  const { data: activeAgreements } = useQuery({
    queryKey: ['agreements', 'active'],
    queryFn: () => agreementsService.list({ status: 'active', page_size: 100 }),
  })

  // Fetch overdue agreements
  const { data: overdueAgreements } = useQuery({
    queryKey: ['agreements', 'overdue'],
    queryFn: () => agreementsService.list({ status: 'overdue', page_size: 100 }),
  })

  // Fetch vehicles
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: () => vehiclesService.list({ page_size: 100 }),
  })

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customersService.list({ page_size: 100 }),
  })

  // Calculate stats
  const totalAgreements = agreementsData?.total || 0
  const activeCount = activeAgreements?.total || 0
  const overdueCount = overdueAgreements?.total || 0
  const totalVehicles = vehiclesData?.total || 0
  const totalCustomers = customersData?.total || 0

  // Calculate vehicle stats
  const vehicles = vehiclesData?.items || []
  const availableVehicles = vehicles.filter((v: Vehicle) => v.status === 'available').length
  const rentedVehicles = vehicles.filter((v: Vehicle) => v.status === 'rented').length
  const maintenanceVehicles = vehicles.filter((v: Vehicle) => v.status === 'maintenance').length

  // Get recent agreements
  const recentAgreements = agreementsData?.items?.slice(0, 5) || []

  // Get agreements due today
  const today = new Date().toISOString().split('T')[0]
  const dueToday = activeAgreements?.items?.filter((a: Agreement) => {
    const returnDate = a.expected_return_datetime?.split('T')[0]
    return returnDate === today
  }) || []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={() => navigate('/agreements/new')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          New Agreement
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Agreements"
          value={activeCount}
          subtitle="Currently rented"
          icon={<FileText className="h-6 w-6" />}
          color="blue"
          onClick={() => navigate('/agreements?status=active')}
        />
        <StatCard
          title="Overdue Returns"
          value={overdueCount}
          subtitle={overdueCount > 0 ? 'Requires attention' : 'All on time'}
          icon={<AlertTriangle className="h-6 w-6" />}
          color={overdueCount > 0 ? 'red' : 'green'}
          onClick={() => navigate('/agreements?status=overdue')}
        />
        <StatCard
          title="Available Vehicles"
          value={availableVehicles}
          subtitle={`of ${totalVehicles} total`}
          icon={<Car className="h-6 w-6" />}
          color="green"
          onClick={() => navigate('/vehicles?status=available')}
        />
        <StatCard
          title="Total Customers"
          value={totalCustomers}
          subtitle="Registered"
          icon={<Users className="h-6 w-6" />}
          color="purple"
          onClick={() => navigate('/customers')}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Vehicles Rented"
          value={rentedVehicles}
          subtitle="Currently out"
          icon={<TrendingUp className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Due Today"
          value={dueToday.length}
          subtitle="Returns expected"
          icon={<Calendar className="h-6 w-6" />}
          color={dueToday.length > 0 ? 'yellow' : 'gray'}
        />
        <StatCard
          title="In Maintenance"
          value={maintenanceVehicles}
          subtitle="Vehicles"
          icon={<Wrench className="h-6 w-6" />}
          color={maintenanceVehicles > 0 ? 'yellow' : 'gray'}
        />
        <StatCard
          title="Total Agreements"
          value={totalAgreements}
          subtitle="All time"
          icon={<DollarSign className="h-6 w-6" />}
          color="gray"
          onClick={() => navigate('/agreements')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
          <div className="space-y-3">
            <QuickAction
              title="New Agreement"
              description="Create a standard rental"
              icon={<Plus className="h-5 w-5 text-blue-600" />}
              onClick={() => navigate('/agreements/new')}
              color="bg-blue-50"
            />
            <QuickAction
              title="Wedding Agreement"
              description="Multi-vehicle rental"
              icon={<FileText className="h-5 w-5 text-pink-600" />}
              onClick={() => navigate('/agreements/wedding/new')}
              color="bg-pink-50"
            />
            <QuickAction
              title="Add Customer"
              description="Register new customer"
              icon={<Users className="h-5 w-5 text-purple-600" />}
              onClick={() => navigate('/customers')}
              color="bg-purple-50"
            />
            <QuickAction
              title="Add Vehicle"
              description="Add to fleet"
              icon={<Car className="h-5 w-5 text-green-600" />}
              onClick={() => navigate('/vehicles')}
              color="bg-green-50"
            />
          </div>
        </div>

        {/* Recent Agreements */}
        <div className="lg:col-span-2 rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Agreements</h2>
            <button
              onClick={() => navigate('/agreements')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              View all →
            </button>
          </div>
          {recentAgreements.length === 0 ? (
            <p className="py-8 text-center text-gray-500">No agreements yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-500">
                    <th className="pb-3 font-medium">Agreement #</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Return Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentAgreements.map((agreement: Agreement) => (
                    <tr
                      key={agreement.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/agreements/${agreement.id}`)}
                    >
                      <td className="py-3 font-medium text-gray-900">
                        {agreement.agreement_number}
                      </td>
                      <td className="py-3 text-gray-600">{agreement.customer_name}</td>
                      <td className="py-3">
                        <StatusBadge status={agreement.status} />
                      </td>
                      <td className="py-3 text-gray-600">
                        {new Date(agreement.expected_return_datetime).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Overdue Alerts */}
      {overdueCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">Overdue Agreements</h3>
              <p className="mt-1 text-sm text-red-700">
                You have {overdueCount} agreement{overdueCount > 1 ? 's' : ''} that{' '}
                {overdueCount > 1 ? 'are' : 'is'} past the expected return date.
              </p>
              <button
                onClick={() => navigate('/agreements?status=overdue')}
                className="mt-3 text-sm font-medium text-red-800 hover:text-red-900"
              >
                View overdue agreements →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Due Today */}
      {dueToday.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
          <div className="flex items-start gap-4">
            <Clock className="h-6 w-6 text-yellow-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-800">Returns Due Today</h3>
              <p className="mt-1 text-sm text-yellow-700">
                {dueToday.length} vehicle{dueToday.length > 1 ? 's' : ''} expected to be returned
                today.
              </p>
              <div className="mt-3 space-y-2">
                {dueToday.slice(0, 3).map((agreement: Agreement) => (
                  <div
                    key={agreement.id}
                    className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm cursor-pointer hover:shadow-md"
                    onClick={() => navigate(`/agreements/${agreement.id}`)}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{agreement.agreement_number}</p>
                      <p className="text-sm text-gray-500">{agreement.customer_name}</p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-yellow-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    active: 'bg-blue-100 text-blue-700',
    closed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status] || styles.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
