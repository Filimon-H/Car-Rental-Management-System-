import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2, User } from 'lucide-react'
import { driversService, Driver, CreateDriverData } from '@/services/drivers'

export default function DriversPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', page, searchTerm],
    queryFn: () => driversService.list({ page, search: searchTerm || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: driversService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const handleEdit = (driver: Driver) => {
    setEditingDriver(driver)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingDriver(null)
    setShowModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <button onClick={handleAdd} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700">
          <Plus className="h-5 w-5" /> Add Driver
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search drivers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border py-2 pl-10 pr-4 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Driver</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">License</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">License Expiry</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.items.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{driver.first_name} {driver.last_name}</div>
                        <div className="text-sm text-gray-500">{driver.email || 'No email'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{driver.phone_primary}</td>
                  <td className="px-6 py-4 text-sm">{driver.license_number}</td>
                  <td className="px-6 py-4 text-sm">
                    {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${driver.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {driver.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleEdit(driver)} className="p-1 text-gray-400 hover:text-primary">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(driver.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.pages }, (_, i) => (
            <button
              key={i + 1}
              onClick={() => setPage(i + 1)}
              className={`rounded px-3 py-1 ${page === i + 1 ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <DriverModal
          driver={editingDriver}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['drivers'] }) }}
        />
      )}
    </div>
  )
}

function DriverModal({ driver, onClose, onSuccess }: { driver: Driver | null; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState<CreateDriverData>({
    first_name: driver?.first_name || '',
    last_name: driver?.last_name || '',
    phone_primary: driver?.phone_primary || '',
    phone_secondary: driver?.phone_secondary || '',
    email: driver?.email || '',
    id_type: driver?.id_type || 'national_id',
    id_number: driver?.id_number || '',
    license_number: driver?.license_number || '',
    license_expiry: driver?.license_expiry ? driver.license_expiry.split('T')[0] : '',
    license_class: driver?.license_class || '',
    house_number: driver?.house_number || '',
    wereda: driver?.wereda || '',
    subcity: driver?.subcity || '',
    city: driver?.city || '',
    emergency_contact_name: driver?.emergency_contact_name || '',
    emergency_contact_phone: driver?.emergency_contact_phone || '',
    notes: driver?.notes || '',
  })

  const createMutation = useMutation({ mutationFn: driversService.create, onSuccess })
  const updateMutation = useMutation({ mutationFn: (data: CreateDriverData) => driversService.update(driver!.id, data), onSuccess })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = {
      ...formData,
      license_expiry: formData.license_expiry ? formData.license_expiry + 'T00:00:00' : undefined,
    }
    if (driver) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{driver ? 'Edit Driver' : 'Add Driver'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">First Name *</label>
              <input type="text" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Last Name *</label>
              <input type="text" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Primary Phone *</label>
              <input type="tel" value={formData.phone_primary} onChange={e => setFormData({...formData, phone_primary: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Secondary Phone</label>
              <input type="tel" value={formData.phone_secondary} onChange={e => setFormData({...formData, phone_secondary: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">License Number *</label>
              <input type="text" value={formData.license_number} onChange={e => setFormData({...formData, license_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">License Expiry</label>
              <input type="date" value={formData.license_expiry} onChange={e => setFormData({...formData, license_expiry: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">License Class</label>
              <input type="text" value={formData.license_class} onChange={e => setFormData({...formData, license_class: e.target.value})} className="w-full rounded-lg border px-3 py-2" placeholder="e.g. Class 3" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">ID Type</label>
              <select value={formData.id_type} onChange={e => setFormData({...formData, id_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="kebele_id">Kebele ID</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ID Number</label>
            <input type="text" value={formData.id_number} onChange={e => setFormData({...formData, id_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">House Number</label>
              <input type="text" value={formData.house_number} onChange={e => setFormData({...formData, house_number: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Wereda</label>
              <input type="text" value={formData.wereda} onChange={e => setFormData({...formData, wereda: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subcity</label>
              <select value={formData.subcity} onChange={e => setFormData({...formData, subcity: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                <option value="">Select Subcity</option>
                <option value="Bole">Bole</option>
                <option value="Lideta">Lideta</option>
                <option value="Yeka">Yeka</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Emergency Contact Name</label>
              <input type="text" value={formData.emergency_contact_name} onChange={e => setFormData({...formData, emergency_contact_name: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Emergency Contact Phone</label>
              <input type="tel" value={formData.emergency_contact_phone} onChange={e => setFormData({...formData, emergency_contact_phone: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50">
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
