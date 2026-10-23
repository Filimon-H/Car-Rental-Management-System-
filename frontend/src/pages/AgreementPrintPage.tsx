import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { agreementsService } from '@/services/agreements'
import { customersService } from '@/services/customers'
import { collateralsService } from '@/services/collaterals'
import { vehiclesService } from '@/services/vehicles'
import { ArrowLeft, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate as sharedFormatDate, formatDateTime as sharedFormatDateTime } from '@/lib/utils'

/** The office line printed on agreements. Matches the public site. */
const COMPANY_PHONE = '+251 911 669414'

export default function AgreementPrintPage() {
  const { t } = useTranslation()
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
    sharedFormatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const formatDateTime = (dateStr: string) =>
    sharedFormatDateTime(dateStr, {
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
        <div className="text-center text-red-500">{t('agreementPrint.notFound')}</div>
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
          {t('agreementPrint.backToAgreement')}
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700"
        >
          <Printer className="h-4 w-4" />
          {t('agreementPrint.printSavePdf')}
        </button>
      </div>

      {/* Printable content */}
      <div className="mx-auto max-w-4xl bg-white p-8 print:max-w-none print:p-0">
        {/* Header */}
        <div className="mb-8 border-b-2 border-gray-800 pb-4 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide">{t('agreementPrint.carRentalAgreement')}</h1>
          <p className="mt-2 text-lg font-semibold">{agreement.agreement_number}</p>
          <p className="text-sm text-gray-600">
            Date: {formatDate(agreement.created_at || new Date().toISOString())}
          </p>
        </div>

        {/* Parties Section */}
        <div className="mb-6 grid grid-cols-2 gap-8">
          <div>
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementPrint.lessorCompany')}</h2>
            <p className="font-semibold">{t('auth.carRentalManagement')}</p>
            <p>{t('agreementPrint.companyLocation')}</p>
            {/* Was the literal placeholder "+251 XXX XXX XXX" on a signed document. */}
            <p>{t('agreementPrint.phone')}: {COMPANY_PHONE}</p>
          </div>
          <div>
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementPrint.lesseeCustomer')}</h2>
            <p className="font-semibold">{customer?.full_name || agreement.customer_name}</p>
            <p>{t('agreementPrint.phone')}: {customer?.phone_primary || '—'}</p>
            {customer?.id_type && (
              <p>
                {customer.id_type}: {customer.id_number}
              </p>
            )}
            {customer?.subcity && <p>{t('agreementPrint.address')}: {customer.subcity}, {customer.city || t('customerDetail.defaultCity')}</p>}
          </div>
        </div>

        {/*
          A with-driver agreement never named the driver, so the signed copy
          left nobody on paper responsible for the car while it was out.
        */}
        {agreement.driver && (
          <div className="mb-6">
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementPrint.driver')}</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.name')}:</td>
                  <td>{agreement.driver.first_name} {agreement.driver.last_name}</td>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.phone')}:</td>
                  <td>{agreement.driver.phone_primary}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.licence')}:</td>
                  <td colSpan={3}>{agreement.driver.license_number}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Vehicle Details */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('vehicleUpsert.vehicleDetails')}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.plateNumber')}:</td>
                <td>{vehicle?.plate_number || agreement.vehicle_segments?.[0]?.plate_number || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.makeModel')}:</td>
                <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.year')}:</td>
                <td>{vehicle?.year || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.color')}:</td>
                <td>{vehicle?.color || 'N/A'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.fuelType')}:</td>
                <td>{vehicle?.fuel_type || 'N/A'}</td>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.transmission')}:</td>
                <td>{vehicle?.transmission || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rental Period */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementCreate.rentalPeriod')}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.pickupDateTime')}:</td>
                <td>{formatDateTime(agreement.pickup_datetime)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.expectedReturn')}:</td>
                <td>{formatDateTime(agreement.expected_return_datetime)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.pickupLocation')}:</td>
                <td>{agreement.pickup_location || t('agreementPrint.office')}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.returnLocation')}:</td>
                <td>{agreement.return_location || t('agreementPrint.office')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Financial Terms */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementPrint.financialTerms')}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.dailyRate')}:</td>
                <td>{formatCurrency(agreement.agreed_daily_rate)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.securityDeposit')}:</td>
                <td>{formatCurrency(agreement.deposit_amount || 0)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.totalCharges')}:</td>
                <td>{formatCurrency(agreement.total_charges)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">{t('agreementPrint.totalPayments')}:</td>
                <td>{formatCurrency(agreement.total_payments)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-1 pr-4">{t('agreementPrint.balanceDue')}:</td>
                <td>{formatCurrency(agreement.balance_due ?? agreement.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Collateral/Guarantor */}
        {collateral && (
          <div className="mb-6">
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('customerDetail.guarantorInformation')}</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.name')}:</td>
                  <td>{collateral.first_name} {collateral.last_name}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.phone')}:</td>
                  <td>{collateral.phone_primary}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 font-medium">{t('agreementPrint.relationship')}:</td>
                  <td>{collateral.relationship_to_customer || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Terms and Conditions */}
        <div className="mb-6">
          <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('agreementPrint.termsAndConditions')}</h2>
          <ol className="list-inside list-decimal space-y-1 text-xs">
            {/*
              The terms stay in English on purpose. They are binding contract
              wording; an Amharic version should come from the business or its
              lawyer, not from a translation pass that could shift the meaning.
            */}
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
            <h2 className="mb-2 border-b font-bold uppercase text-gray-700">{t('customerCreate.additionalNotes')}</h2>
            <p className="text-sm">{agreement.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-2 border-b border-gray-400" style={{ height: '60px' }}></div>
            <p className="text-sm font-medium">{t('agreementPrint.lessorSignature')}</p>
            <p className="text-xs text-gray-600">Date: _______________</p>
          </div>
          <div>
            <div className="mb-2 border-b border-gray-400" style={{ height: '60px' }}></div>
            <p className="text-sm font-medium">{t('agreementPrint.lesseeSignature')}</p>
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
