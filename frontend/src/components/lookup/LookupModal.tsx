import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, User, Building2, Car } from 'lucide-react'
import { customersService, CustomerSearchResult } from '@/services/customers'
import { vendorsService, VendorSearchResult } from '@/services/vendors'
import { vehiclesService, VehicleSearchResult } from '@/services/vehicles'

type LookupType = 'customer' | 'vendor' | 'vehicle'

interface LookupModalProps {
  type: LookupType
  isOpen: boolean
  onClose: () => void
  onSelect: (item: CustomerSearchResult | VendorSearchResult | VehicleSearchResult) => void
  availableOnly?: boolean // For vehicles
}

export default function LookupModal({ type, isOpen, onClose, onSelect, availableOnly = false }: LookupModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('')
      setDebouncedSearch('')
    }
  }, [isOpen])

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customerSearch', debouncedSearch],
    queryFn: () => customersService.search(debouncedSearch, 15),
    enabled: isOpen && type === 'customer' && debouncedSearch.length >= 2,
  })

  const { data: vendors, isLoading: loadingVendors } = useQuery({
    queryKey: ['vendorSearch', debouncedSearch],
    queryFn: () => vendorsService.search(debouncedSearch, 15),
    enabled: isOpen && type === 'vendor' && debouncedSearch.length >= 2,
  })

  const { data: vehicles, isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicleSearch', debouncedSearch, availableOnly],
    queryFn: () => vehiclesService.search(debouncedSearch, 15, availableOnly),
    enabled: isOpen && type === 'vehicle' && debouncedSearch.length >= 1,
  })

  const isLoading = loadingCustomers || loadingVendors || loadingVehicles

  const getTitle = () => {
    switch (type) {
      case 'customer': return 'Select Customer'
      case 'vendor': return 'Select Vendor'
      case 'vehicle': return 'Select Vehicle'
    }
  }

  const getPlaceholder = () => {
    switch (type) {
      case 'customer': return 'Search by name, phone, or ID...'
      case 'vendor': return 'Search by company or contact...'
      case 'vehicle': return 'Search by plate, make, or model...'
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'customer': return User
      case 'vendor': return Building2
      case 'vehicle': return Car
    }
  }

  const Icon = getIcon()

  if (!isOpen) return null

  const handleSelect = (item: CustomerSearchResult | VendorSearchResult | VehicleSearchResult) => {
    onSelect(item)
    onClose()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">{getTitle()}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={getPlaceholder()}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!isLoading && debouncedSearch.length < (type === 'vehicle' ? 1 : 2) && (
            <div className="py-8 text-center text-gray-500">
              Type {type === 'vehicle' ? '1' : '2'}+ characters to search
            </div>
          )}

          {/* Customer Results */}
          {type === 'customer' && customers && customers.length > 0 && (
            <div className="divide-y">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => handleSelect(customer)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <Icon className="h-8 w-8 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{customer.full_name}</div>
                    <div className="text-sm text-gray-500">
                      {customer.phone_primary} • {customer.id_number}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Vendor Results */}
          {type === 'vendor' && vendors && vendors.length > 0 && (
            <div className="divide-y">
              {vendors.map((vendor) => (
                <button
                  key={vendor.id}
                  onClick={() => handleSelect(vendor)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <Icon className="h-8 w-8 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{vendor.company_name}</div>
                    <div className="text-sm text-gray-500">
                      {vendor.contact_person && `${vendor.contact_person} • `}{vendor.phone_primary}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Vehicle Results */}
          {type === 'vehicle' && vehicles && vehicles.length > 0 && (
            <div className="divide-y">
              {vehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  onClick={() => handleSelect(vehicle)}
                  disabled={availableOnly && vehicle.status !== 'available'}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon className="h-8 w-8 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {vehicle.make} {vehicle.model} ({vehicle.year})
                    </div>
                    <div className="text-sm text-gray-500">
                      {vehicle.plate_number} • {vehicle.color}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-primary">{formatCurrency(vehicle.daily_rate)}</div>
                    <div className={`text-xs ${vehicle.status === 'available' ? 'text-green-600' : 'text-gray-400'}`}>
                      {vehicle.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {!isLoading && debouncedSearch.length >= (type === 'vehicle' ? 1 : 2) && (
            (type === 'customer' && customers?.length === 0) ||
            (type === 'vendor' && vendors?.length === 0) ||
            (type === 'vehicle' && vehicles?.length === 0)
          ) && (
            <div className="py-8 text-center text-gray-500">
              No results found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 py-2 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Export typed versions for convenience
interface CustomerLookupProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (customer: CustomerSearchResult) => void
}

export function CustomerLookupModal({ isOpen, onClose, onSelect }: CustomerLookupProps) {
  return (
    <LookupModal
      type="customer"
      isOpen={isOpen}
      onClose={onClose}
      onSelect={(item) => onSelect(item as CustomerSearchResult)}
    />
  )
}

interface VendorLookupProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (vendor: VendorSearchResult) => void
}

export function VendorLookupModal({ isOpen, onClose, onSelect }: VendorLookupProps) {
  return (
    <LookupModal
      type="vendor"
      isOpen={isOpen}
      onClose={onClose}
      onSelect={(item) => onSelect(item as VendorSearchResult)}
    />
  )
}

interface VehicleLookupProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (vehicle: VehicleSearchResult) => void
  availableOnly?: boolean
}

export function VehicleLookupModal({ isOpen, onClose, onSelect, availableOnly }: VehicleLookupProps) {
  return (
    <LookupModal
      type="vehicle"
      isOpen={isOpen}
      onClose={onClose}
      onSelect={(item) => onSelect(item as VehicleSearchResult)}
      availableOnly={availableOnly}
    />
  )
}
