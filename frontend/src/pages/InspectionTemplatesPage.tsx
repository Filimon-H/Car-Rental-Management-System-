import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList, ChevronRight, CheckSquare } from 'lucide-react'
import apiClient from '@/services/apiClient'

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
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null)

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
          {t('inspections.templates.title', 'Inspection Templates')}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Templates List */}
        <div className="lg:col-span-1">
          <div className="rounded-lg bg-white shadow">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold text-gray-700">Available Templates</h2>
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
                    No templates found
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
                <h2 className="text-xl font-semibold text-gray-800">{selectedTemplate.name}</h2>
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
                <h3 className="mb-4 font-semibold text-gray-700">Checklist Items</h3>
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
                            <span className="text-xs text-red-500">Required</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Damage Categories */}
                {selectedTemplate.damage_categories.length > 0 && (
                  <div className="mt-6 border-t pt-6">
                    <h3 className="mb-3 font-semibold text-gray-700">Damage Categories</h3>
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
                <p className="mt-2">Select a template to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
