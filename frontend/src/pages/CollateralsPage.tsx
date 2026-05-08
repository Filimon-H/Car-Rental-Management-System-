import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2, Users, AlertTriangle, X } from 'lucide-react'
import { collateralsService, CollateralPerson } from '@/services/collaterals'

export default function CollateralsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<CollateralPerson | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['collaterals', page, searchTerm],
    queryFn: () => collateralsService.list({ page, search: searchTerm || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: collateralsService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collaterals'] }),
  })

  const handleDeleteClick = (collateral: CollateralPerson, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirm(collateral)
  }

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id, {
        onSuccess: () => {
          setDeleteConfirm(null)
        },
        onError: (error: unknown) => {
          const err = error as { response?: { data?: { detail?: string } } }
          alert(err?.response?.data?.detail || 'Failed to delete collateral person')
        },
      })
    }
  }

  const handleEdit = (collateral: CollateralPerson) => {
    navigate(`/collaterals/${collateral.id}/edit`)
  }

  const handleAdd = () => {
    navigate('/collaterals/new')
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
                <tr
                  key={collateral.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/collaterals/${collateral.id}`)}
                >
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(collateral)
                      }}
                      className="p-1 text-gray-400 hover:text-primary"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(collateral, e)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Delete Collateral Person</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to permanently delete{' '}
                  <strong>{deleteConfirm.first_name} {deleteConfirm.last_name}</strong>? This action cannot be undone.
                </p>
              </div>
              <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
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

    </div>
  )
}
