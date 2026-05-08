import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Edit, Image, Loader2 } from 'lucide-react'
import { collateralsService } from '@/services/collaterals'
import { collateralDocumentsService, CollateralDocument } from '@/services/collateralDocuments'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useProtectedFileUrl } from '@/hooks/use-protected-file-url'

export default function CollateralDetailPage() {
  const navigate = useNavigate()
  const { customerId, collateralId } = useParams<{ customerId: string; collateralId: string }>()
  const customerIdNum = customerId ? parseInt(customerId, 10) : null
  const collateralIdNum = parseInt(collateralId || '0', 10)

  const { data: collateral, isLoading: loadingCollateral } = useQuery({
    queryKey: ['collateral', collateralIdNum],
    queryFn: () => collateralsService.get(collateralIdNum),
    enabled: !!collateralIdNum,
  })

  const { data: documentsData, isLoading: loadingDocuments } = useQuery({
    queryKey: ['collateral-documents', collateralIdNum],
    queryFn: () => collateralDocumentsService.list(collateralIdNum),
    enabled: !!collateralIdNum,
  })

  if (loadingCollateral) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!collateral) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <p className="text-lg text-gray-600">Collateral person not found</p>
        <button
          onClick={() => (customerIdNum ? navigate(`/customers/${customerIdNum}`) : navigate('/collaterals'))}
          className="mt-4 text-blue-600 hover:underline"
        >
          {customerIdNum ? 'Back to Customer' : 'Back to Collaterals'}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (customerIdNum ? navigate(`/customers/${customerIdNum}`) : navigate('/collaterals'))}
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{collateral.first_name} {collateral.last_name}</h1>
              <p className="text-sm text-gray-500">Collateral Details</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (customerIdNum) {
                navigate(`/customers/${customerIdNum}/collaterals/${collateralIdNum}/edit`)
                return
              }
              navigate(`/collaterals/${collateralIdNum}/edit`)
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Edit className="h-4 w-4" />
            Edit Collateral
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <User className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Personal Information</h2>
              </div>
              <dl className="space-y-3">
                <InfoRow label="Full Name" value={`${collateral.first_name} ${collateral.last_name}`} />
                <InfoRow label="Relationship" value={collateral.relationship_to_customer || '-'} />
              </dl>
            </div>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <Phone className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Contact Information</h2>
              </div>
              <dl className="space-y-3">
                <InfoRow label="Primary Phone" value={collateral.phone_primary} />
                {collateral.phone_secondary && <InfoRow label="Secondary Phone" value={collateral.phone_secondary} />}
                {collateral.email && <InfoRow label="Email" value={collateral.email} icon={<Mail className="h-4 w-4" />} />}
              </dl>
            </div>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Identification</h2>
              </div>
              <dl className="space-y-3">
                <InfoRow label="ID Type" value={collateral.id_type || '-'} />
                <InfoRow label="ID Number" value={collateral.id_number || '-'} />
              </dl>
            </div>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-700">
                <MapPin className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Address</h2>
              </div>
              <dl className="space-y-3">
                {collateral.house_number && <InfoRow label="House Number" value={collateral.house_number} />}
                {collateral.wereda && <InfoRow label="Wereda" value={collateral.wereda} />}
                {collateral.subcity && <InfoRow label="Subcity" value={collateral.subcity} />}
                <InfoRow label="City" value={collateral.city || 'Addis Ababa'} />
              </dl>
            </div>
          </div>

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

function DocumentCard({ document }: { document: CollateralDocument }) {
  const isImage = document.mime_type?.startsWith('image/')
  const docTypeLabels: Record<string, string> = {
    passport: 'Passport',
    national_id: 'National ID',
    kebele_id: 'Kebele ID',
    driver_license: 'Driver License',
  }

  const [open, setOpen] = useState(false)
  const imagePath = `/api/collaterals/${document.collateral_id}/documents/${document.id}/file`
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
