import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Power } from 'lucide-react'
import { lookupsService, LookupValue } from '@/services/lookups'
import { getErrorMessage } from '@/services/apiClient'
import { useTranslation } from 'react-i18next'
import { toast } from '@/hooks/use-toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type FormMode = 'create' | 'edit'

export default function AdminLookupsPage() {
  const [pendingDelete, setPendingDelete] = useState<LookupValue | null>(null)
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('create')
  const [editing, setEditing] = useState<LookupValue | null>(null)

  const [form, setForm] = useState<{ category: string; value: string; label: string; sort_order: number }>({
    category: '',
    value: '',
    label: '',
    sort_order: 0,
  })

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['lookups-categories'],
    queryFn: () => lookupsService.listCategories(),
  })

  const {
    data: defaults,
    isLoading: loadingDefaults,
    isError: defaultsError,
  } = useQuery({
    queryKey: ['lookups-defaults'],
    queryFn: () => lookupsService.getDefaults(),
  })

  const fallbackCategories = useMemo(() => {
    const keys = defaults ? Object.keys(defaults) : []
    keys.sort((a, b) => a.localeCompare(b))
    return keys
  }, [defaults])

  const mergedCategories = useMemo(() => {
    const set = new Set<string>()
    ;(categories || []).forEach((c) => set.add(c))
    fallbackCategories.forEach((c) => set.add(c))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [categories, fallbackCategories])

  const effectiveCategory = selectedCategory || mergedCategories?.[0] || ''

  const { data: values, isLoading: loadingValues } = useQuery({
    queryKey: ['lookups-category', effectiveCategory],
    queryFn: () => lookupsService.listCategoryValues(effectiveCategory, true),
    enabled: !!effectiveCategory,
  })

  const sortedValues = useMemo(() => {
    const list = values ? [...values] : []
    list.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.value.localeCompare(b.value)
    })
    return list
  }, [values])

  const createMutation = useMutation({
    mutationFn: lookupsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups-categories'] })
      queryClient.invalidateQueries({ queryKey: ['lookups-category', effectiveCategory] })
      setFormOpen(false)
    },
    onError: (error: unknown) => {
      toast({ description: getErrorMessage(error, 'Failed to create lookup value'), variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: import('@/services/lookups').LookupValueUpdate }) => lookupsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups-category', effectiveCategory] })
      setFormOpen(false)
    },
    onError: (error: unknown) => {
      toast({ description: getErrorMessage(error, 'Failed to update lookup value'), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => lookupsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookups-category', effectiveCategory] })
    },
    onError: (error: unknown) => {
      toast({ description: getErrorMessage(error, 'Failed to delete lookup value'), variant: 'destructive' })
    },
  })

  const openCreate = () => {
    setFormMode('create')
    setEditing(null)
    setForm({ category: effectiveCategory, value: '', label: '', sort_order: 0 })
    setFormOpen(true)
  }

  const openEdit = (val: LookupValue) => {
    setFormMode('edit')
    setEditing(val)
    setForm({
      category: val.category,
      value: val.value,
      label: val.label || '',
      sort_order: val.sort_order,
    })
    setFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.category.trim() || !form.value.trim()) {
      toast({ description: t('validation.categoryValueRequired'), variant: 'destructive' })
      return
    }

    if (formMode === 'create') {
      await createMutation.mutateAsync({
        category: form.category.trim(),
        value: form.value.trim(),
        label: form.label.trim() || undefined,
        sort_order: form.sort_order,
      })
    } else if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        data: {
          value: form.value.trim(),
          label: form.label.trim() || undefined,
          sort_order: form.sort_order,
        },
      })
    }
  }

  const toggleActive = async (row: LookupValue) => {
    await updateMutation.mutateAsync({ id: row.id, data: { is_active: !row.is_active } })
  }

  const handleDelete = (row: LookupValue) => setPendingDelete(row)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminLookups.adminSetting')}</h1>
          <p className="text-sm text-gray-500">Manage dropdown values used throughout the system</p>
        </div>
        <button
          onClick={openCreate}
          disabled={false}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" /> {t('adminLookups.addValue')}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-3">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-2 text-sm font-medium text-gray-700">{t('common.category')}</div>
            {loadingCategories || loadingDefaults ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : defaultsError ? (
              <div className="text-sm text-red-600">Failed to load lookup defaults.</div>
            ) : (
              mergedCategories.length > 0 ? (
                <select
                  value={effectiveCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  {mergedCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">
                  No lookup categories found.
                  <div className="mt-2 text-xs text-gray-500">
                    Add your first value using “Add Value”.
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="col-span-12 md:col-span-9">
          <div className="overflow-hidden rounded-lg border bg-white">
            {!effectiveCategory ? (
              <div className="p-6 text-center text-gray-500">Select a category or add your first value.</div>
            ) : loadingValues ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('common.value')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('common.label')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('common.sort')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{t('dashboard.status')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedValues.map((row) => (
                    <tr key={row.id} className={row.is_active ? '' : 'bg-gray-50'}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.value}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{row.label || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{row.sort_order}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                          {row.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => toggleActive(row)}
                            className="p-1 text-gray-500 hover:text-gray-800"
                            title={row.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1 text-gray-500 hover:text-primary"
                            title={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="p-1 text-gray-500 hover:text-red-600"
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedValues.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">No values in this category.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{formMode === 'create' ? 'Add Value' : 'Edit Value'}</h2>
              <button onClick={() => setFormOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Category *</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  disabled={formMode === 'edit'}
                  className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Value *</label>
                <input
                  value={form.value}
                  onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('common.label')}</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('adminLookups.sortOrder')}</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value || '0', 10) }))}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border px-4 py-2 hover:bg-gray-50">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    {pendingDelete && (
      <ConfirmModal
        title={t('adminLookups.confirmDeleteTitle')}
        message={t('adminLookups.confirmDeleteBody', {
          label: pendingDelete.label || pendingDelete.value,
          category: pendingDelete.category,
        })}
        confirmLabel={t('common.delete')}
        destructive
        isLoading={deleteMutation.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          deleteMutation.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    )}
    </div>
  )
}
