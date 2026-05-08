import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import Layout from '@/app/Layout'

// Pages
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AgreementsPage from '@/pages/AgreementsPage'
import AgreementDetailPage from '@/pages/AgreementDetailPage'
import AgreementCreatePage from '@/pages/AgreementCreatePage'
import AgreementPrintPage from '@/pages/AgreementPrintPage'
import CustomersPage from '@/pages/CustomersPage'
import CustomerCreatePage from '@/pages/CustomerCreatePage'
import CustomerEditPage from '@/pages/CustomerEditPage'
import CustomerDetailPage from '@/pages/CustomerDetailPage'
import CollateralCreatePage from '@/pages/CollateralCreatePage'
import CollateralEditPage from '@/pages/CollateralEditPage'
import CollateralDetailPage from '@/pages/CollateralDetailPage'
import CollateralNewPage from '@/pages/CollateralNewPage'
import VendorsPage from '@/pages/VendorsPage'
import VehiclesPage from '@/pages/VehiclesPage'
import VehicleUpsertPage from '@/pages/VehicleUpsertPage'
import VehicleDetailPage from '@/pages/VehicleDetailPage'
import DriversPage from '@/pages/DriversPage'
import CollateralsPage from '@/pages/CollateralsPage'
import WeddingAgreementsPage from '@/pages/WeddingAgreementsPage'
import WeddingAgreementCreatePage from '@/pages/WeddingAgreementCreatePage'
import VendorWeddingAgreementsPage from '@/pages/VendorWeddingAgreementsPage'
import LedgerPage from '@/pages/LedgerPage'
import InspectionTemplatesPage from '@/pages/InspectionTemplatesPage'
import InspectionCreatePage from '@/pages/InspectionCreatePage'
import AdminLookupsPage from '@/pages/AdminLookupsPage'
import UsersPage from '@/pages/UsersPage'
import { ProtectedRoute, UnauthorizedPage } from '@/routes/guards'

function App() {
  return (
    <>
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
    </>
  )
}

export default App
