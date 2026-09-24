import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList, ChevronRight, CheckSquare } from 'lucide-react'
import apiClient, { getErrorMessage } from '@/services/apiClient'
import { templatesService, type TemplateInput } from '@/services/inspections'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import InspectionsListPage from '@/pages/InspectionsListPage'

interface ChecklistItem {
  id: string
  label: string
  category: string
  required: boolean
}

interface InspectionTemplate {
  id: number
  name: string
  description: string | null
  template_type: string
  checklist_items: ChecklistItem[]
  damage_categories: string[]
  is_active: boolean
  created_at: string
}

export default function InspectionTemplatesPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'inspections' | 'templates'>('inspections')
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null)
  const [editing, setEditing] = useState<InspectionTemplate | 'new' | null>(null)
  const [retiring, setRetiring] = useState<InspectionTemplate | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const refreshTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['inspectionTemplates'] })
    setEditing(null)
    setRetiring(null)
  }

  const saveMutation = useMutation({
    mutationFn: (data: TemplateInput & { id?: number }) =>
      data.id ? templatesService.update(data.id, data) : templatesService.create(data),
    onSuccess: (saved) => {
      refreshTemplates()
      setSelectedTemplate(saved)
    },
    onError: (error: unknown) =>
      setSaveError(getErrorMessage(error, t('inspection.templateSaveFailed'))),
  })

  const retireMutation = useMutation({
    mutationFn: (id: number) => templatesService.retire(id),
    onSuccess: () => {
      refreshTemplates()
      setSelectedTemplate(null)
    },
    onError: (error: unknown) =>
      setSaveError(getErrorMessage(error, t('inspection.templateSaveFailed'))),
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['inspectionTemplates'],
    queryFn: () => apiClient.get<InspectionTemplate[]>('/inspections/templates'),
  })

  const groupedItems = selectedTemplate?.checklist_items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <ClipboardList className="h-8 w-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-800">
          {tab === 'templates'
            ? t('inspections.templates.title', 'Inspection Templates')
            : t('inspection.pageTitle')}
        </h1>
        {tab === 'templates' && (
          <button
            type="button"
            onClick={() => {
              setSaveError(null)
              setEditing('new')
            }}
            className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            + {t('inspection.newTemplate')}
          </button>
        )}
      </div>

      {saveError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
          {saveError}
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b">
        {(['inspections', 'templates'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {key === 'inspections' ? t('inspection.historyTab') : t('inspection.templatesTab')}
          </button>
        ))}
      </div>

      {tab === 'inspections' && <InspectionsListPage />}

      {tab === 'templates' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Templates List */}
        <div className="lg:col-span-1">
          <div className="rounded-lg bg-white shadow">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold text-gray-700">{t('inspection.availableTemplates')}</h2>
            </div>
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : (
              <div className="divide-y">
                {templates?.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 ${
                      selectedTemplate?.id === template.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium text-gray-900">{template.name}</div>
                      <div className="text-sm text-gray-500">
                        {template.checklist_items.length} items • {template.template_type}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </button>
                ))}
                {templates?.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    {t('inspection.noTemplatesFound')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Template Details */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="rounded-lg bg-white shadow">
              <div className="border-b px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-gray-800">{selectedTemplate.name}</h2>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveError(null)
                        setEditing(selectedTemplate)
                      }}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t('common.edit')}
                    </button>
                    {selectedTemplate.is_active && (
                      <button
                        type="button"
                        onClick={() => setRetiring(selectedTemplate)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        {t('inspection.retireTemplate')}
                      </button>
                    )}
                  </div>
                </div>
                {selectedTemplate.description && (
                  <p className="mt-1 text-sm text-gray-500">{selectedTemplate.description}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                    {selectedTemplate.template_type}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    selectedTemplate.is_active 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedTemplate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Checklist Items by Category */}
              <div className="p-6">
                <h3 className="mb-4 font-semibold text-gray-700">{t('inspection.checklistItems')}</h3>
                {groupedItems && Object.entries(groupedItems).map(([category, items]) => (
                  <div key={category} className="mb-6">
                    <h4 className="mb-2 text-sm font-medium uppercase text-gray-500">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border px-3 py-2"
                        >
                          <CheckSquare className="h-5 w-5 text-gray-400" />
                          <span className="flex-1 text-gray-700">{item.label}</span>
                          {item.required && (
                            <span className="text-xs text-red-500">{t('sections.required')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Damage Categories */}
                {selectedTemplate.damage_categories.length > 0 && (
                  <div className="mt-6 border-t pt-6">
                    <h3 className="mb-3 font-semibold text-gray-700">{t('inspection.damageCategories')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.damage_categories.map((category) => (
                        <span
                          key={category}
                          className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
              <div className="text-center text-gray-500">
                <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2">{t('inspection.selectTemplateToView')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      )}

      {editing && (
        <TemplateEditorModal
          template={editing === 'new' ? null : editing}
          isLoading={saveMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            saveMutation.mutate(editing === 'new' ? data : { ...data, id: editing.id })
          }
        />
      )}

      {retiring && (
        <ConfirmModal
          title={t('inspection.confirmRetireTitle')}
          message={t('inspection.confirmRetireBody')}
          confirmLabel={t('inspection.retireTemplate')}
          destructive
          isLoading={retireMutation.isPending}
          onClose={() => setRetiring(null)}
          onConfirm={() => retireMutation.mutate(retiring.id)}
        />
      )}
    </div>
  )
}


/** Create or edit a template, including its checklist rows. */
function TemplateEditorModal({
  template,
  onClose,
  onSave,
  isLoading,
}: {
  template: InspectionTemplate | null
  onClose: () => void
  onSave: (data: TemplateInput) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [templateType, setTemplateType] = useState(template?.template_type ?? 'pickup')
  const [items, setItems] = useState<ChecklistItem[]>(template?.checklist_items ?? [])
  const [damage, setDamage] = useState((template?.damage_categories ?? []).join(', '))

  const slug = (label: string) =>
    label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const updateItem = (index: number, patch: Partial<ChecklistItem>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            name: name.trim(),
            description: description.trim() || null,
            template_type: templateType,
            // The id is derived from the label so callers never have to
            // invent one, but an edited row keeps whatever id it had.
            checklist_items: items
              .filter((item) => item.label.trim())
              .map((item) => ({ ...item, id: item.id || slug(item.label) })),
            damage_categories: damage
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          })
        }}
        className="my-8 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          {template ? t('inspection.editTemplate') : t('inspection.newTemplate')}
        </h2>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tpl-name" className="mb-1 block text-sm font-medium text-gray-700">
              {t('inspection.templateName')}
            </label>
            <input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="tpl-type" className="mb-1 block text-sm font-medium text-gray-700">
              {t('sections.type')}
            </label>
            <select
              id="tpl-type"
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="pickup">{t('agreementActions.pickup')}</option>
              <option value="return">{t('agreementActions.return')}</option>
              <option value="periodic">{t('inspection.periodic')}</option>
              <option value="general">{t('options.other')}</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="tpl-desc" className="mb-1 block text-sm font-medium text-gray-700">
            {t('sections.description')}
          </label>
          <input
            id="tpl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {t('inspection.checklistItems')}
            </span>
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { id: '', label: '', category: 'general', required: true },
                ])
              }
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              + {t('inspection.addItem')}
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={t('inspection.itemLabel')}
                  value={item.label}
                  onChange={(e) => updateItem(index, { label: e.target.value })}
                  placeholder={t('inspection.itemLabel')}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label={t('inspection.itemCategory')}
                  value={item.category}
                  onChange={(e) => updateItem(index, { category: e.target.value })}
                  placeholder={t('inspection.itemCategory')}
                  className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => updateItem(index, { required: e.target.checked })}
                  />
                  {t('inspection.itemRequired')}
                </label>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="tpl-damage" className="mb-1 block text-sm font-medium text-gray-700">
            {t('inspection.damageCategories')}
          </label>
          <input
            id="tpl-damage"
            value={damage}
            onChange={(e) => setDamage(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-sm text-gray-500">{t('inspection.damageCategoriesHint')}</p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
