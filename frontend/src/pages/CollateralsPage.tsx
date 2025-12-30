import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2, Users, Building2 } from 'lucide-react'
import { collateralsService, CollateralPerson, CreateCollateralData } from '@/services/collaterals'
import { customersService, Customer } from '@/services/customers'

export default function CollateralsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCollateral, setEditingCollateral] = useState<CollateralPerson | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['collaterals', page, searchTerm],
    queryFn: () => collateralsService.list({ page, search: searchTerm || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: collateralsService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collaterals'] }),
  })

  const handleEdit = (collateral: CollateralPerson) => {
    setEditingCollateral(collateral)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingCollateral(null)
    setShowModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Collateral Persons</h1>
        <button onClick={handleAdd} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700">
          <Plus className="h-5 w-5" /> Add Collateral Person
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search collateral persons..."
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
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Collateral Person</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Relationship</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.items.map((collateral) => (
                <tr key={collateral.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                        <Users className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <div className="font-medium">{collateral.first_name} {collateral.last_name}</div>
                        <div className="text-sm text-gray-500">{collateral.email || 'No email'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{collateral.phone_primary}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="text-gray-500">{collateral.id_type}:</span> {collateral.id_number}
                  </td>
                  <td className="px-6 py-4 text-sm">{collateral.relationship_to_customer || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm">
                    {collateral.customer ? (
                      <span>{collateral.customer.first_name} {collateral.customer.last_name}</span>
                    ) : (
                      <span className="text-gray-400">Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${collateral.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {collateral.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleEdit(collateral)} className="p-1 text-gray-400 hover:text-primary">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(collateral.id)} className="p-1 text-gray-400 hover:text-red-500">
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
        <CollateralModal
          collateral={editingCollateral}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['collaterals'] }) }}
        />
      )}
    </div>
  )
}

function CollateralModal({ collateral, onClose, onSuccess }: { collateral: CollateralPerson | null; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'customer' | 'details'>(collateral ? 'details' : 'customer')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  
  const [formData, setFormData] = useState<CreateCollateralData>({
    customer_id: collateral?.customer_id || 0,
    first_name: collateral?.first_name || '',
    last_name: collateral?.last_name || '',
    phone_primary: collateral?.phone_primary || '',
    phone_secondary: collateral?.phone_secondary || '',
    email: collateral?.email || '',
    relationship_to_customer: collateral?.relationship_to_customer || '',
    id_type: collateral?.id_type || 'national_id',
    id_number: collateral?.id_number || '',
    house_number: collateral?.house_number || '',
    wereda: collateral?.wereda || '',
    subcity: collateral?.subcity || '',
    city: collateral?.city || '',
    occupation: collateral?.occupation || '',
    employer_name: collateral?.employer_name || '',
    employer_phone: collateral?.employer_phone || '',
    notes: collateral?.notes || '',
  })

  // Fetch customers for selection
  const { data: customersData } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => customersService.list({ search: customerSearch || undefined, page_size: 50 }),
  })

  const createMutation = useMutation({ 
    mutationFn: collateralsService.create, 
    onSuccess,
    onError: (error: any) => alert(error?.response?.data?.detail || 'Failed to create collateral person')
  })
  const updateMutation = useMutation({ 
    mutationFn: (data: CreateCollateralData) => collateralsService.update(collateral!.id, data), 
    onSuccess,
    onError: (error: any) => alert(error?.response?.data?.detail || 'Failed to update collateral person')
  })

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer)
    setFormData({ ...formData, customer_id: customer.id })
    setStep('details')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (collateral) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">{collateral ? 'Edit Collateral Person' : 'Add Collateral Person'}</h2>
        
        {/* Step 1: Select Customer */}
        {step === 'customer' && !collateral && (
          <div className="space-y-4">
            <p className="text-gray-600">First, select the customer this collateral person is for:</p>
            <input
              type="text"
              placeholder="Search customers..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {customersData?.items.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => handleCustomerSelect(customer)}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium">{customer.first_name} {customer.last_name}</div>
                      <div className="text-sm text-gray-500">{customer.phone_primary}</div>
                    </div>
                  </div>
                </div>
              ))}
              {customersData?.items.length === 0 && (
                <div className="p-4 text-center text-gray-500">No customers found.</div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Step 2: Collateral Details */}
        {(step === 'details' || collateral) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selected Customer Info */}
            {(selectedCustomer || collateral?.customer) && (
              <div className="p-3 bg-orange-50 rounded-lg mb-4">
                <div className="text-sm font-medium text-orange-800">Customer:</div>
                <div className="text-orange-900">
                  {selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : 
                   collateral?.customer ? `${collateral.customer.first_name} ${collateral.customer.last_name}` : ''}
                  {' • '}{selectedCustomer?.phone_primary || collateral?.customer?.phone_primary}
                </div>
                {!collateral && (
                  <button type="button" onClick={() => setStep('customer')} className="text-sm text-orange-600 hover:underline mt-1">
                    Change customer
                  </button>
                )}
              </div>
            )}

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
                <label className="mb-1 block text-sm font-medium">Relationship to Customer</label>
                <select value={formData.relationship_to_customer} onChange={e => setFormData({...formData, relationship_to_customer: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  <option value="">Select...</option>
                  <option value="parent">Parent</option>
                  <option value="spouse">Spouse</option>
                  <option value="sibling">Sibling</option>
                  <option value="friend">Friend</option>
                  <option value="employer">Employer</option>
                  <option value="colleague">Colleague</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">ID Type *</label>
                <select value={formData.id_type} onChange={e => setFormData({...formData, id_type: e.target.value})} className="w-full rounded-lg border px-3 py-2">
                  <option value="national_id">National ID</option>
                  <option value="passport">Passport</option>
                  <option value="kebele_id">Kebele ID</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">ID Number *</label>
                <input type="text" value={formData.id_number} onChange={e => setFormData({...formData, id_number: e.target.value})} required className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Occupation</label>
                <input type="text" value={formData.occupation} onChange={e => setFormData({...formData, occupation: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Employer Name</label>
                <input type="text" value={formData.employer_name} onChange={e => setFormData({...formData, employer_name: e.target.value})} className="w-full rounded-lg border px-3 py-2" />
              </div>
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
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} className="w-full rounded-lg border px-3 py-2" />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isLoading || !formData.customer_id} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50">
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
