import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Edit, Trash2, Car, Building2 } from 'lucide-react'
import { vehiclesService, Vehicle, CreateVehicleData, VehicleStatus, LookupDefaults } from '@/services/vehicles'
import { vendorsService, Vendor } from '@/services/vendors'

const statusColors: Record<VehicleStatus, string> = {
  available: 'bg-green-100 text-green-800',
  rented: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  reserved: 'bg-purple-100 text-purple-800',
  retired: 'bg-gray-100 text-gray-600',
}

export default function VehiclesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('')
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', page, searchTerm, statusFilter],
    queryFn: () => vehiclesService.list({
      page,
      page_size: 20,
      search: searchTerm || undefined,
      status: statusFilter || undefined,
    }),
  })

  const deleteMutation = useMutation({
    mutationFn: vehiclesService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: VehicleStatus }) => vehiclesService.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle)
    setShowModal(true)
  }

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this vehicle?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleStatusChange = (id: number, status: VehicleStatus) => {
    statusMutation.mutate({ id, status })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('vehicles.title', 'Vehicles')}</h1>
        <button
          onClick={() => { setEditingVehicle(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Add Vehicle
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by plate, make, model..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as VehicleStatus | ''); setPage(1) }}
          className="rounded-lg border border-gray-300 px-4 py-2"
        >
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="rented">Rented</option>
          <option value="maintenance">Maintenance</option>
          <option value="reserved">Reserved</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vehicle</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Daily Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data?.items.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Car className="h-8 w-8 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">{vehicle.make} {vehicle.model}</div>
                        <div className="text-sm text-gray-500">{vehicle.plate_number}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    <div>{vehicle.year} • {vehicle.color}</div>
                    <div className="text-gray-400">{vehicle.vehicle_type} • {vehicle.seats} seats</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {formatCurrency(vehicle.daily_rate)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <select
                      value={vehicle.status}
                      onChange={(e) => handleStatusChange(vehicle.id, e.target.value as VehicleStatus)}
                      disabled={vehicle.status === 'rented'}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[vehicle.status]} border-0 cursor-pointer disabled:cursor-not-allowed`}
                    >
                      <option value="available">Available</option>
                      <option value="rented" disabled>Rented</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="reserved">Reserved</option>
                      <option value="retired">Retired</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(vehicle)} className="text-blue-600 hover:text-blue-800">
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(vehicle.id)}
                        disabled={vehicle.status === 'rented'}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No vehicles found</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.total)} of {data.total}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <VehicleModal
          vehicle={editingVehicle}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['vehicles'] }) }}
        />
      )}
    </div>
  )
}

function VehicleModal({ vehicle, onClose, onSuccess }: { vehicle: Vehicle | null; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'vendor' | 'vehicle'>(vehicle ? 'vehicle' : 'vendor')
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  
  const [formData, setFormData] = useState<CreateVehicleData>({
    vendor_id: vehicle?.vendor_id || 0,
    plate_number: vehicle?.plate_number || '',
    plate_code: vehicle?.plate_code || '03',
    plate_city: vehicle?.plate_city || '',
    make: vehicle?.make || 'Toyota',
    model: vehicle?.model || '',
    year: vehicle?.year || new Date().getFullYear(),
    color: vehicle?.color || '',
    vehicle_type: vehicle?.vehicle_type || 'standard',
    service_type: vehicle?.service_type || 'business',
    car_condition: vehicle?.car_condition || 'good',
    motor_number: vehicle?.motor_number || '',
    chassis_number: vehicle?.chassis_number || '',
    seats: vehicle?.seats || 5,
    transmission: vehicle?.transmission || 'automatic',
    fuel_type: vehicle?.fuel_type || 'petrol',
    daily_rate: vehicle?.daily_rate || 0,
    current_mileage: vehicle?.current_mileage || undefined,
    notes: vehicle?.notes || '',
  })

  // Fetch vendors for selection
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-search', vendorSearch],
    queryFn: () => vendorsService.list({ search: vendorSearch || undefined, page_size: 50 }),
  })

  // Fetch lookup values for dropdowns
  const { data: lookups } = useQuery({
    queryKey: ['lookups-defaults'],
    queryFn: () => vehiclesService.getLookupDefaults(),
  })

  // Set selected vendor if editing
  useState(() => {
    if (vehicle?.vendor) {
      setSelectedVendor({
        id: vehicle.vendor.id,
        vendor_type: vehicle.vendor.vendor_type,
        company_name: vehicle.vendor.company_name,
        contact_person: vehicle.vendor.contact_person,
        phone_primary: vehicle.vendor.phone_primary,
        email: vehicle.vendor.email,
      } as Vendor)
    }
  })

  const createMutation = useMutation({ 
    mutationFn: vehiclesService.create, 
    onSuccess,
    onError: (error: any) => alert(error?.response?.data?.detail || 'Failed to create vehicle')
  })
  const updateMutation = useMutation({ 
    mutationFn: (data: CreateVehicleData) => vehiclesService.update(vehicle!.id, data), 
    onSuccess,
    onError: (error: any) => alert(error?.response?.data?.detail || 'Failed to update vehicle')
  })

  const handleVendorSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor)
    setFormData({ ...formData, vendor_id: vendor.id })
    setStep('vehicle')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (vehicle) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{vehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        
        {/* Step 1: Select Vendor */}
        {step === 'vendor' && !vehicle && (
          <div className="space-y-4">
            <p className="text-gray-600">First, select the vendor (owner) for this vehicle:</p>
            <input
              type="text"
              placeholder="Search vendors..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {vendorsData?.items.map((vendor) => (
                <div
                  key={vendor.id}
                  onClick={() => handleVendorSelect(vendor)}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium">
                        {vendor.vendor_type === 'company' ? vendor.company_name : vendor.contact_person}
                      </div>
                      <div className="text-sm text-gray-500">
                        {vendor.vendor_type === 'company' ? `Contact: ${vendor.contact_person || 'N/A'}` : 'Individual'} • {vendor.phone_primary}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {vendorsData?.items.length === 0 && (
                <div className="p-4 text-center text-gray-500">No vendors found. Create a vendor first.</div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle Details */}
        {(step === 'vehicle' || vehicle) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selected Vendor Info */}
            {selectedVendor && (
              <div className="p-3 bg-blue-50 rounded-lg mb-4">
                <div className="text-sm font-medium text-blue-800">Vendor:</div>
                <div className="text-blue-900">
                  {selectedVendor.vendor_type === 'company' ? selectedVendor.company_name : selectedVendor.contact_person}
                  {' • '}{selectedVendor.phone_primary}
                </div>
                {!vehicle && (
                  <button type="button" onClick={() => setStep('vendor')} className="text-sm text-blue-600 hover:underline mt-1">
                    Change vendor
                  </button>
                )}
              </div>
            )}

            {/* Plate Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Plate Number *</label>
                <input type="text" value={formData.plate_number} onChange={e => setFormData({...formData, plate_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" placeholder="12345" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Plate Code *</label>
                <select value={formData.plate_code} onChange={e => setFormData({...formData, plate_code: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  {(lookups?.plate_code || [{ value: '01', label: '01' }, { value: '02', label: '02' }, { value: '03', label: '03' }, { value: '05', label: '05' }, { value: 'daily', label: 'Daily' }, { value: 'temporary', label: 'Temporary' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Plate City</label>
                <input type="text" value={formData.plate_city || ''} onChange={e => setFormData({...formData, plate_city: e.target.value})} className="w-full rounded-lg border px-3 py-2" placeholder="AA" />
              </div>
            </div>

            {/* Vehicle Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Make *</label>
                <input type="text" value={formData.make} onChange={e => setFormData({...formData, make: e.target.value})} required className="w-full rounded-lg border px-3 py-2" placeholder="Toyota" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Model *</label>
                <select value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  <option value="">Select Model</option>
                  {(lookups?.car_model || [{ value: 'vitz', label: 'Vitz' }, { value: 'toyota_corolla', label: 'Toyota Corolla' }, { value: 'suzuki_dzire', label: 'Suzuki Dzire' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Year *</label>
                <input type="number" value={formData.year} onChange={e => setFormData({...formData, year: parseInt(e.target.value)})} required min={1990} max={2030} className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Color *</label>
                <select value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  <option value="">Select Color</option>
                  {(lookups?.color || [{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'silver', label: 'Silver' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Seats</label>
                <input type="number" value={formData.seats} onChange={e => setFormData({...formData, seats: parseInt(e.target.value)})} min={1} max={50} className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Vehicle Type *</label>
                <select value={formData.vehicle_type} onChange={e => setFormData({...formData, vehicle_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  {(lookups?.vehicle_type || [{ value: 'standard', label: 'Standard' }, { value: 'compact', label: 'Compact' }, { value: 'luxury', label: 'Luxury' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Service Type *</label>
                <select value={formData.service_type} onChange={e => setFormData({...formData, service_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  {(lookups?.service_type || [{ value: 'business', label: 'Business' }, { value: 'wedding', label: 'Wedding' }, { value: 'field_work', label: 'Field Work' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Car Condition *</label>
                <select value={formData.car_condition} onChange={e => setFormData({...formData, car_condition: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  {(lookups?.car_condition || [{ value: 'excellent', label: 'Excellent' }, { value: 'very_good', label: 'Very Good' }, { value: 'good', label: 'Good' }, { value: 'not_good', label: 'Not Good' }, { value: 'risky', label: 'Risky' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Fuel Type</label>
                <select value={formData.fuel_type} onChange={e => setFormData({...formData, fuel_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  {(lookups?.fuel_type || [{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'electric', label: 'Electric' }]).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Identification */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Motor Number</label>
                <input type="text" value={formData.motor_number || ''} onChange={e => setFormData({...formData, motor_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Chassis Number</label>
                <input type="text" value={formData.chassis_number || ''} onChange={e => setFormData({...formData, chassis_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Transmission</label>
                <select value={formData.transmission} onChange={e => setFormData({...formData, transmission: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Daily Rate (ETB) *</label>
                <input type="number" step="0.01" value={formData.daily_rate} onChange={e => setFormData({...formData, daily_rate: parseFloat(e.target.value)})} required min={0} className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Current Mileage (km)</label>
              <input type="number" value={formData.current_mileage || ''} onChange={e => setFormData({...formData, current_mileage: e.target.value ? parseInt(e.target.value) : undefined})} min={0} className="w-full rounded-lg border px-3 py-2" />
            </div>

            {/* Insurance Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Insurance Policy Number</label>
                <input type="text" value={formData.insurance_policy_number || ''} onChange={e => setFormData({...formData, insurance_policy_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" placeholder="INS-XXXX-XXXX" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Insurance Expiry Date</label>
                <input type="date" value={formData.insurance_expiry ? formData.insurance_expiry.split('T')[0] : ''} onChange={e => setFormData({...formData, insurance_expiry: e.target.value ? e.target.value + 'T00:00:00' : undefined})} className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2" />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isLoading || !formData.vendor_id} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50">
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
