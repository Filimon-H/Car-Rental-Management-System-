import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Car, Pencil } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { vehiclesService } from '@/services/vehicles'
import { ImageLightbox } from '@/components/ui/ImageLightbox'

const toUploadUrl = (relativePath: string) => {
  const cleaned = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `/api/uploads/${cleaned}`
}

export default function VehicleDetailPage() {
  const navigate = useNavigate()
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const id = vehicleId ? parseInt(vehicleId, 10) : NaN

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string>('')
  const [lightboxAlt, setLightboxAlt] = useState<string>('')

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => vehiclesService.getById(id),
    enabled: Number.isFinite(id),
  })

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/vehicles')} className="mb-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg border bg-white p-6 text-gray-600">Vehicle not found.</div>
      </div>
    )
  }

  const vendorName = vehicle.vendor
    ? vehicle.vendor.vendor_type === 'company'
      ? vehicle.vendor.company_name
      : vehicle.vendor.contact_person
    : null

  const insuranceExpiry = vehicle.insurance_expiry ? vehicle.insurance_expiry.split('T')[0] : null

  const photos = [
    { key: 'front', label: 'Front View', path: vehicle.photo_front },
    { key: 'back', label: 'Back View', path: vehicle.photo_back },
    { key: 'left', label: 'Left View', path: vehicle.photo_left },
    { key: 'right', label: 'Right View', path: vehicle.photo_right },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/vehicles')} className="rounded-lg p-2 hover:bg-gray-100" title="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Vehicle Details</h1>
              <p className="text-sm text-gray-500">{vehicle.plate_number}</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/vehicles/${vehicle.id}/edit`)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-lg border bg-white p-6">
            <div className="mb-4 flex items-center gap-3">
              <Car className="h-8 w-8 text-gray-400" />
              <div>
                <div className="text-lg font-semibold text-gray-900">{vehicle.make} {vehicle.model} ({vehicle.year})</div>
                <div className="text-sm text-gray-500">
                  {vehicle.plate_number} • {vehicle.plate_code}{vehicle.plate_city ? ` • ${vehicle.plate_city}` : ''}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Owner (Vendor)</div>
                <div className="mt-1 text-sm text-gray-900">{vendorName || '—'}</div>
                <div className="text-sm text-gray-600">{vehicle.vendor?.phone_primary || '—'}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Insurance</div>
                <div className="mt-1 text-sm text-gray-900">Policy: {vehicle.insurance_policy_number || '—'}</div>
                <div className="text-sm text-gray-600">Expiry: {insuranceExpiry || '—'}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Plate</div>
                <div className="mt-1 text-sm text-gray-900">{vehicle.plate_number}</div>
                <div className="text-sm text-gray-600">
                  {vehicle.plate_code}{vehicle.plate_city ? ` • ${vehicle.plate_city}` : ''}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Pricing</div>
                <div className="mt-1 text-sm text-gray-900">Daily Rate: {vehicle.daily_rate}</div>
                <div className="text-sm text-gray-600">Status: {vehicle.status}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Mileage</div>
                <div className="mt-1 text-sm text-gray-900">{vehicle.current_mileage ?? '—'}</div>
                <div className="text-sm text-gray-600">Active: {vehicle.is_active ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Service / Fuel</div>
                <div className="mt-1 text-sm text-gray-900">{vehicle.service_type} • {vehicle.fuel_type}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Type / Seats</div>
                <div className="mt-1 text-sm text-gray-900">{vehicle.vehicle_type} • {vehicle.seats} seats</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Condition / Transmission</div>
                <div className="mt-1 text-sm text-gray-900">{vehicle.car_condition} • {vehicle.transmission}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Identification</div>
                <div className="mt-1 text-sm text-gray-900">Motor: {vehicle.motor_number || '—'}</div>
                <div className="text-sm text-gray-600">Chassis: {vehicle.chassis_number || '—'}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Metadata</div>
                <div className="mt-1 text-sm text-gray-900">Created: {new Date(vehicle.created_at).toLocaleString()}</div>
                <div className="text-sm text-gray-600">Updated: {new Date(vehicle.updated_at).toLocaleString()}</div>
              </div>
            </div>

            {vehicle.notes ? (
              <div className="mt-6 rounded-lg bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Notes</div>
                <div className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{vehicle.notes}</div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Vehicle Photos</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {photos.map((p) => (
                <div key={p.key} className="overflow-hidden rounded-lg border bg-gray-50">
                  <div className="border-b bg-white px-4 py-2 text-sm font-medium text-gray-700">{p.label}</div>
                  <div className="flex h-56 items-center justify-center">
                    {p.path ? (
                      <img
                        src={toUploadUrl(p.path)}
                        alt={p.label}
                        className="h-full w-full cursor-zoom-in object-cover"
                        onClick={() => {
                          const src = toUploadUrl(p.path as string)
                          setLightboxSrc(src)
                          setLightboxAlt(p.label)
                          setLightboxOpen(true)
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = ''
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="text-sm text-gray-500">No image</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {lightboxOpen && lightboxSrc && (
              <ImageLightbox open={lightboxOpen} src={lightboxSrc} alt={lightboxAlt} onClose={() => setLightboxOpen(false)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
