import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { agreementsService } from '@/services/agreements'
import { customersService } from '@/services/customers'
import { collateralsService } from '@/services/collaterals'
import { vehiclesService } from '@/services/vehicles'
import { ArrowLeft, Printer } from 'lucide-react'

export default function AgreementPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const agreementId = id ? Number.parseInt(id, 10) : null

  const { data: agreement, isLoading } = useQuery({
    queryKey: ['agreement', id],
    queryFn: () => agreementsService.getById(agreementId as number),
    enabled: !!agreementId,
  })

  const { data: customer } = useQuery({
    queryKey: ['customer', agreement?.customer_id],
    queryFn: () => customersService.getById(agreement!.customer_id),
    enabled: !!agreement?.customer_id,
  })

  const { data: collateral } = useQuery({
    queryKey: ['collateral', agreement?.collateral_person_id],
    queryFn: () => collateralsService.get(agreement!.collateral_person_id as number),
    enabled: !!agreement?.collateral_person_id,
  })

  const primaryVehicleId = agreement?.vehicle_segments?.[0]?.vehicle_id
  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', primaryVehicleId],
    queryFn: () => vehiclesService.getById(primaryVehicleId as number),
    enabled: !!primaryVehicleId,
  })

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)

  const handlePrint = () => {
    window.print()
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!agreement) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">Agreement not found</div>
      </div>
    )
  }

  return (
    <>
      {/* Screen-only controls */}
      <div className="mb-4 flex items-center justify-between p-4 print:hidden">
        <button
          onClick={() => navigate(`/agreements/${id}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agreement
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      {/* Printable content */}
      <div className="mx-auto max-w-4xl bg-white p-8 print:max-w-none print:p-0">
        {/* Header */}
        <div className="mb-8 border-b-2 border-gray-800 pb-4 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide">Car Rental Agreement</h1>
          <p className="mt-2 text-lg font-semibold">{agreement.agreement_number}</p>
          <p className="text-sm text-gray-600">
            Date: {formatDate(agreement.created_at || new Date().toISOString())}
          </p>
        </div>

        {/* Parties Section */}
        <div className="mb-6 grid grid-cols-2 gap-8">
          <div>
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Lessor (Company)</h2>
            <p className="font-semibold">Car Rental Management</p>
            <p>Addis Ababa, Ethiopia</p>
            <p>Phone: +251 XXX XXX XXX</p>
          </div>
          <div>
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Lessee (Customer)</h2>
            <p className="font-semibold">{customer?.full_name || agreement.customer_name}</p>
            <p>Phone: {customer?.phone_primary || 'N/A'}</p>
            {customer?.id_type && (
              <p>
                {customer.id_type}: {customer.id_number}
              </p>
            )}
            {customer?.subcity && <p>Address: {customer.subcity}, {customer.city || 'Addis Ababa'}</p>}
          </div>
        </div>

        {/* Vehicle Details */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Vehicle Details</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">Plate Number:</td>
                <td>{vehicle?.plate_number || agreement.vehicle_segments?.[0]?.plate_number || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">Make/Model:</td>
                <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Year:</td>
                <td>{vehicle?.year || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">Color:</td>
                <td>{vehicle?.color || 'N/A'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Fuel Type:</td>
                <td>{vehicle?.fuel_type || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">Transmission:</td>
                <td>{vehicle?.transmission || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rental Period */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Rental Period</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">Pickup Date/Time:</td>
                <td>{formatDateTime(agreement.pickup_datetime)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Expected Return:</td>
                <td>{formatDateTime(agreement.expected_return_datetime)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Pickup Location:</td>
                <td>{agreement.pickup_location || 'Office'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Return Location:</td>
                <td>{agreement.return_location || 'Office'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Financial Terms */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Financial Terms</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">Daily Rate:</td>
                <td>{formatCurrency(agreement.agreed_daily_rate)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Security Deposit:</td>
                <td>{formatCurrency(agreement.deposit_amount || 0)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Total Charges:</td>
                <td>{formatCurrency(agreement.total_charges)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">Total Payments:</td>
                <td>{formatCurrency(agreement.total_payments)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-1 pr-4">Balance Due:</td>
                <td>{formatCurrency(agreement.balance_due ?? agreement.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Collateral/Guarantor */}
        {collateral && (
          <div className="mb-6">
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Guarantor Information</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 pr-4 font-medium">Name:</td>
                  <td>{collateral.first_name} {collateral.last_name}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 font-medium">Phone:</td>
                  <td>{collateral.phone_primary}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 font-medium">Relationship:</td>
                  <td>{collateral.relationship_to_customer || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Terms and Conditions */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Terms and Conditions</h2>
          <ol className="list-inside list-decimal space-y-1 text-xs">
            <li>The Lessee agrees to return the vehicle in the same condition as received.</li>
            <li>The Lessee is responsible for all traffic violations during the rental period.</li>
            <li>The vehicle must not be used for illegal purposes or driven outside agreed areas.</li>
            <li>Fuel must be returned at the same level as pickup or charges will apply.</li>
            <li>Late returns will incur additional daily charges.</li>
            <li>The security deposit will be refunded after vehicle inspection upon return.</li>
            <li>Any damage to the vehicle will be deducted from the security deposit.</li>
            <li>The Lessee must report any accidents immediately to the Lessor.</li>
          </ol>
        </div>

        {/* Notes */}
        {agreement.notes && (
          <div className="mb-6">
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">Additional Notes</h2>
            <p className="text-sm">{agreement.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-2 border-b border-gray-400" style={{ height: '60px' }}></div>
            <p className="text-sm font-medium">Lessor Signature</p>
            <p className="text-xs text-gray-600">Date: _______________</p>
          </div>
          <div>
            <div className="mb-2 border-b border-gray-400" style={{ height: '60px' }}></div>
            <p className="text-sm font-medium">Lessee Signature</p>
            <p className="text-xs text-gray-600">Date: _______________</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-4 text-center text-xs text-gray-500">
          <p>This agreement is legally binding upon signing by both parties.</p>
          <p>Agreement #{agreement.agreement_number} | Generated on {formatDate(new Date().toISOString())}</p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4;
            margin: 1cm;
          }
        }
      `}</style>
    </>
  )
}
