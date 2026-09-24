import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import Layout from '@/app/Layout'

// Login and Dashboard are the first things a session renders, so they stay in
// the main bundle; every other page is fetched when its route is first visited.
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'

const AgreementsPage = lazy(() => import('@/pages/AgreementsPage'))
const AgreementDetailPage = lazy(() => import('@/pages/AgreementDetailPage'))
const AgreementCreatePage = lazy(() => import('@/pages/AgreementCreatePage'))
const AgreementPrintPage = lazy(() => import('@/pages/AgreementPrintPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const CustomerCreatePage = lazy(() => import('@/pages/CustomerCreatePage'))
const CustomerEditPage = lazy(() => import('@/pages/CustomerEditPage'))
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'))
const CollateralCreatePage = lazy(() => import('@/pages/CollateralCreatePage'))
const CollateralEditPage = lazy(() => import('@/pages/CollateralEditPage'))
const CollateralDetailPage = lazy(() => import('@/pages/CollateralDetailPage'))
const CollateralNewPage = lazy(() => import('@/pages/CollateralNewPage'))
const VendorsPage = lazy(() => import('@/pages/VendorsPage'))
const VendorUpsertPage = lazy(() => import('@/pages/VendorUpsertPage'))
const VehiclesPage = lazy(() => import('@/pages/VehiclesPage'))
const VehicleUpsertPage = lazy(() => import('@/pages/VehicleUpsertPage'))
const VehicleDetailPage = lazy(() => import('@/pages/VehicleDetailPage'))
const DriversPage = lazy(() => import('@/pages/DriversPage'))
const CollateralsPage = lazy(() => import('@/pages/CollateralsPage'))
const WeddingAgreementsPage = lazy(() => import('@/pages/WeddingAgreementsPage'))
const WeddingAgreementCreatePage = lazy(() => import('@/pages/WeddingAgreementCreatePage'))
const VendorWeddingAgreementsPage = lazy(() => import('@/pages/VendorWeddingAgreementsPage'))
const LedgerPage = lazy(() => import('@/pages/LedgerPage'))
const InspectionTemplatesPage = lazy(() => import('@/pages/InspectionTemplatesPage'))
const InspectionCreatePage = lazy(() => import('@/pages/InspectionCreatePage'))
const InspectionDetailPage = lazy(() => import('@/pages/InspectionDetailPage'))
const AdminLookupsPage = lazy(() => import('@/pages/AdminLookupsPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))

import { ProtectedRoute, UnauthorizedPage } from '@/routes/guards'

/** Shown while a route's chunk is being fetched. */
function RouteFallback() {
  return (
    <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Main app with layout — all routes require authentication */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Agreements — static routes MUST come before :id wildcard */}
          <Route path="/agreements" element={<AgreementsPage />} />
          <Route path="/agreements/new" element={<AgreementCreatePage />} />
          <Route path="/agreements/wedding" element={<WeddingAgreementsPage />} />
          <Route path="/agreements/wedding/new" element={<WeddingAgreementCreatePage />} />
          <Route path="/agreements/vendor-wedding" element={<VendorWeddingAgreementsPage />} />
          <Route path="/agreements/:id" element={<AgreementDetailPage />} />
          <Route path="/agreements/:id/print" element={<AgreementPrintPage />} />

          {/* Customers */}
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<CustomerCreatePage />} />
          <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/customers/:customerId/edit" element={<CustomerEditPage />} />
          <Route path="/customers/:customerId/collaterals/new" element={<CollateralCreatePage />} />
          <Route path="/customers/:customerId/collaterals/:collateralId" element={<CollateralDetailPage />} />
          <Route path="/customers/:customerId/collaterals/:collateralId/edit" element={<CollateralEditPage />} />

          {/* Fleet */}
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/vendors/new" element={<VendorUpsertPage />} />
          <Route path="/vendors/:vendorId/edit" element={<VendorUpsertPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/new" element={<VehicleUpsertPage />} />
          <Route path="/vehicles/:vehicleId/edit" element={<VehicleUpsertPage />} />
          <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
          <Route path="/drivers" element={<DriversPage />} />

          {/* Collaterals */}
          <Route path="/collaterals" element={<CollateralsPage />} />
          <Route path="/collaterals/new" element={<CollateralNewPage />} />
          <Route path="/collaterals/:collateralId/edit" element={<CollateralEditPage />} />
          <Route path="/collaterals/:collateralId" element={<CollateralDetailPage />} />

          {/* Inspections */}
          <Route path="/inspections" element={<InspectionTemplatesPage />} />
          <Route path="/inspections/new" element={<InspectionCreatePage />} />
          <Route path="/inspections/:id" element={<InspectionDetailPage />} />

          {/* Ledger */}
          <Route path="/ledger" element={<LedgerPage />} />

          {/* Admin — role-guarded */}
          <Route
            path="/admin/lookups"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AdminLookupsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<div className="flex h-screen items-center justify-center">404 - Not Found</div>} />
      </Routes>
      <Toaster />
    </Suspense>
  )
}

export default App
