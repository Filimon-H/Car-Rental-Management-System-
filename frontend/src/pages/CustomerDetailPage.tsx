import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Edit, Users, Image, Loader2, Calendar, Shield } from 'lucide-react'
import { customersService } from '@/services/customers'
import { customerDocumentsService, CustomerDocument } from '@/services/customerDocuments'
import { collateralsService, CollateralPerson } from '@/services/collaterals'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useProtectedFileUrl } from '@/hooks/use-protected-file-url'

export default function CustomerDetailPage() {
  const navigate = useNavigate()
  const { customerId } = useParams<{ customerId: string }>()
  const customerIdNum = parseInt(customerId || '0', 10)

  // Fetch customer data
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', customerIdNum],
    queryFn: () => customersService.getById(customerIdNum),
    enabled: !!customerIdNum,
  })

  // Fetch customer documents
  const { data: documentsData, isLoading: loadingDocuments } = useQuery({
    queryKey: ['customer-documents', customerIdNum],
    queryFn: () => customerDocumentsService.list(customerIdNum),
    enabled: !!customerIdNum,
  })

  // Fetch collaterals for this customer
  const { data: collateralsData, isLoading: loadingCollaterals } = useQuery({
    queryKey: ['collaterals', { customer_id: customerIdNum }],
    queryFn: () => collateralsService.list({ customer_id: customerIdNum }),
    enabled: !!customerIdNum,
  })

  if (loadingCustomer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <p className="text-lg text-gray-600">Customer not found</p>
        <button onClick={() => navigate('/customers')} className="mt-4 text-blue-600 hover:underline">
          Back to Customers
        </button>
      </div>
    )
  }

  const isIndividual = customer.business_type === 'individual'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/customers')} className="rounded-lg p-2 hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{customer.full_name}</h1>
              <p className="text-sm text-gray-500">Customer Details</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/customers/${customerIdNum}/edit`)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Edit className="h-4 w-4" />
            Edit Customer
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Customer Info Cards */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Basic Info */}
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <User className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Personal Information</h2>
              </div>
              <dl className="space-y-3">
                <InfoRow label="Full Name" value={customer.full_name} />
                <InfoRow label="Business Type" value={customer.business_type} />
                {!isIndividual && customer.company_name && (
                  <InfoRow label="Company Name" value={customer.company_name} />
                )}
                {customer.tin_number && (
                  <InfoRow label="TIN Number" value={customer.tin_number} />
                )}
              </dl>
            </div>

            {/* Contact Info */}
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <Phone className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Contact Information</h2>
              </div>
              <dl className="space-y-3">
                <InfoRow label="Primary Phone" value={customer.phone_primary} />
                {customer.phone_secondary && (
                  <InfoRow label="Secondary Phone" value={customer.phone_secondary} />
                )}
                {customer.email && (
                  <InfoRow label="Email" value={customer.email} icon={<Mail className="h-4 w-4" />} />
                )}
              </dl>
            </div>

            {/* ID & License - Only for Individual */}
            {isIndividual && (
              <div className="rounded-lg border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-gray-700">
                  <FileText className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">ID & License</h2>
                </div>
                <dl className="space-y-3">
                  <InfoRow label="ID Type" value={customer.id_type || '-'} />
                  <InfoRow label="ID Number" value={customer.id_number || '-'} />
                  {customer.id_expiry_date && (
                    <InfoRow label="ID Expiry" value={new Date(customer.id_expiry_date).toLocaleDateString()} icon={<Calendar className="h-4 w-4" />} />
                  )}
                  <InfoRow label="Driver License" value={customer.driver_license_number || '-'} />
                  {customer.driver_license_expiry && (
                    <InfoRow label="License Expiry" value={new Date(customer.driver_license_expiry).toLocaleDateString()} icon={<Calendar className="h-4 w-4" />} />
                  )}
                </dl>
              </div>
            )}

            {/* Address */}
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <MapPin className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Address</h2>
              </div>
              <dl className="space-y-3">
                {customer.house_number && <InfoRow label="House Number" value={customer.house_number} />}
                {customer.wereda && <InfoRow label="Wereda" value={customer.wereda} />}
                {customer.subcity && <InfoRow label="Subcity" value={customer.subcity} />}
                <InfoRow label="City" value={customer.city || 'Addis Ababa'} />
              </dl>
            </div>
          </div>

          {/* Documents Section */}
          {isIndividual && (
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <Image className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Uploaded Documents</h2>
              </div>
              {loadingDocuments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : documentsData?.items && documentsData.items.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {documentsData.items.map((doc) => (
                    <DocumentCard key={doc.id} document={doc} />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-gray-500">No documents uploaded</p>
              )}
            </div>
          )}

          {/* Collaterals Section */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-700">
                <Shield className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Collateral Persons</h2>
              </div>
              <button
                onClick={() => navigate(`/customers/${customerIdNum}/collaterals/new`)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add Collateral
              </button>
            </div>
            {loadingCollaterals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : collateralsData?.items && collateralsData.items.length > 0 ? (
              <div className="space-y-3">
                {collateralsData.items.map((collateral) => (
                  <CollateralCard key={collateral.id} collateral={collateral} customerId={customerIdNum} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500">No collateral persons added</p>
            )}
          </div>

          {/* Notes Section */}
          {customer.notes && (
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Notes</h2>
              </div>
              <p className="text-gray-600 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-500">
            <div className="flex gap-6">
              <span>Created: {new Date(customer.created_at).toLocaleString()}</span>
              <span>Updated: {new Date(customer.updated_at).toLocaleString()}</span>
              <span className={`font-medium ${customer.is_active ? 'text-green-600' : 'text-red-600'}`}>
                {customer.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="flex items-center gap-1 text-sm font-medium text-gray-900">
        {icon}
        {value}
      </dd>
    </div>
  )
}

function DocumentCard({ document }: { document: CustomerDocument }) {
  const isImage = document.mime_type?.startsWith('image/')
  const docTypeLabels: Record<string, string> = {
    passport: 'Passport',
    national_id: 'National ID',
    kebele_id: 'Kebele ID',
    driver_license: 'Driver License',
  }

  const [open, setOpen] = useState(false)
  const imagePath = `/api/customers/${document.customer_id}/documents/${document.id}/file`
  const { fileUrl: imageSrc, isLoading } = useProtectedFileUrl(imagePath, isImage)

  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-white">
        {isImage ? (
          imageSrc ? (
            <img
              src={imageSrc}
              alt={document.file_name}
              className="h-full w-full cursor-zoom-in object-cover"
              onClick={() => setOpen(true)}
            />
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileText className="h-12 w-12 text-gray-400" />
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileText className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-gray-700">{docTypeLabels[document.doc_type] || document.doc_type}</p>
      <p className="truncate text-xs text-gray-500">{document.file_name}</p>

      {isImage && imageSrc && (
        <ImageLightbox
          open={open}
          src={imageSrc}
          alt={document.file_name}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function CollateralCard({ collateral, customerId }: { collateral: CollateralPerson; customerId: number }) {
  const navigate = useNavigate()
  
  return (
    <div 
      onClick={() => navigate(`/customers/${customerId}/collaterals/${collateral.id}`)}
      className="flex items-center justify-between rounded-lg border bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900">{collateral.first_name} {collateral.last_name}</p>
          <p className="text-sm text-gray-500">{collateral.relationship_to_customer || 'Relationship not specified'}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-gray-600">{collateral.phone_primary}</p>
        <p className="text-xs text-gray-500">{collateral.id_type}: {collateral.id_number}</p>
      </div>
    </div>
  )
}
