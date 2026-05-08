import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, Search } from 'lucide-react'
import { customersService, Customer } from '@/services/customers'

export default function CollateralNewPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['customers-collateral-select', search],
    queryFn: () => customersService.list({ search: search || undefined, page_size: 50, page: 1, is_active: true }),
  })

  const customers = useMemo(() => data?.items || [], [data])

  const handleSelect = (customer: Customer) => {
    navigate(`/customers/${customer.id}/collaterals/new`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/collaterals')} className="rounded-lg p-2 hover:bg-gray-100" title="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Add Collateral Person</h1>
            <p className="text-sm text-gray-500">First select the customer this collateral person belongs to</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name, phone, or ID..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-hidden rounded-lg border bg-white">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : customers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No customers found.</div>
            ) : (
              <div className="divide-y">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{c.full_name}</div>
                      <div className="text-sm text-gray-500">{c.phone_primary}</div>
                    </div>
                    <div className="text-sm text-gray-400">Select</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
