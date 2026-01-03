import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import Layout from '@/app/Layout'

// Pages
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AgreementsPage from '@/pages/AgreementsPage'
import AgreementDetailPage from '@/pages/AgreementDetailPage'
import AgreementCreatePage from '@/pages/AgreementCreatePage'
import CustomersPage from '@/pages/CustomersPage'
import CustomerCreatePage from '@/pages/CustomerCreatePage'
import CustomerEditPage from '@/pages/CustomerEditPage'
import CustomerDetailPage from '@/pages/CustomerDetailPage'
import CollateralCreatePage from '@/pages/CollateralCreatePage'
import CollateralEditPage from '@/pages/CollateralEditPage'
import VendorsPage from '@/pages/VendorsPage'
import VehiclesPage from '@/pages/VehiclesPage'
import DriversPage from '@/pages/DriversPage'
import CollateralsPage from '@/pages/CollateralsPage'
import WeddingAgreementsPage from '@/pages/WeddingAgreementsPage'
import WeddingAgreementCreatePage from '@/pages/WeddingAgreementCreatePage'
import VendorWeddingAgreementsPage from '@/pages/VendorWeddingAgreementsPage'
import LedgerPage from '@/pages/LedgerPage'
import InspectionTemplatesPage from '@/pages/InspectionTemplatesPage'
import InspectionCreatePage from '@/pages/InspectionCreatePage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        
        {/* Main app with layout */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          
          {/* Agreements */}
          <Route path="/agreements" element={<AgreementsPage />} />
          <Route path="/agreements/new" element={<AgreementCreatePage />} />
          <Route path="/agreements/:id" element={<AgreementDetailPage />} />
          <Route path="/agreements/wedding" element={<WeddingAgreementsPage />} />
          <Route path="/agreements/wedding/new" element={<WeddingAgreementCreatePage />} />
          <Route path="/agreements/vendor-wedding" element={<VendorWeddingAgreementsPage />} />
          
          {/* Master Data */}
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<CustomerCreatePage />} />
          <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/customers/:customerId/edit" element={<CustomerEditPage />} />
          <Route path="/customers/:customerId/collaterals/new" element={<CollateralCreatePage />} />
          <Route path="/customers/:customerId/collaterals/:collateralId/edit" element={<CollateralEditPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/collaterals" element={<CollateralsPage />} />
          
          {/* Inspections */}
          <Route path="/inspections" element={<InspectionTemplatesPage />} />
          <Route path="/inspections/new" element={<InspectionCreatePage />} />
          
          {/* Ledger */}
          <Route path="/ledger" element={<LedgerPage />} />
        </Route>
        
        <Route path="*" element={<div className="flex h-screen items-center justify-center">404 - Not Found</div>} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
