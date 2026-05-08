import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import apiClient from '@/services/apiClient'
import { VehicleLookupModal } from '@/components/lookup/LookupModal'
import { VehicleSearchResult } from '@/services/vehicles'

interface ChecklistItem {
  id: string
  label: string
  category: string
  required: boolean
}

interface InspectionTemplate {
  id: number
  name: string
  checklist_items: ChecklistItem[]
  damage_categories: string[]
}

type ItemStatus = 'ok' | 'damage' | 'na'

interface ChecklistResult {
  status: ItemStatus
  notes: string
}

interface DamageRecord {
  id: string
  category: string
  location: string
  severity: 'minor' | 'moderate' | 'severe'
  description: string
  estimated_cost: number
}

export default function InspectionCreatePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const agreementId = searchParams.get('agreement_id')

  // Form state
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [vehicleInfo, setVehicleInfo] = useState('')
  const [inspectionType, setInspectionType] = useState<string>('pickup')
  const [mileage, setMileage] = useState('')
  const [fuelLevel, setFuelLevel] = useState('100')
  const [checklistResults, setChecklistResults] = useState<Record<string, ChecklistResult>>({})
  const [damageRecords, setDamageRecords] = useState<DamageRecord[]>([])
  const [conditionRating, setConditionRating] = useState<number>(5)
  const [notes, setNotes] = useState('')
  const [showVehicleLookup, setShowVehicleLookup] = useState(false)

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['inspectionTemplates'],
    queryFn: () => apiClient.get<InspectionTemplate[]>('/inspections/templates'),
  })

  const selectedTemplate = templates?.find(t => t.id === templateId)

  // Group checklist items by category
  const groupedItems = selectedTemplate?.checklist_items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<{ id: number }>('/inspections', data),
    onSuccess: (data) => {
      navigate(`/inspections/${data.id}`)
    },
  })

  const handleVehicleSelect = (vehicle: VehicleSearchResult) => {
    setVehicleId(vehicle.id)
    setVehicleInfo(`${vehicle.make} ${vehicle.model} (${vehicle.plate_number})`)
  }

  const handleItemStatusChange = (itemId: string, status: ItemStatus) => {
    setChecklistResults(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], status, notes: prev[itemId]?.notes || '' }
    }))
  }

  const handleItemNotesChange = (itemId: string, notes: string) => {
    setChecklistResults(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], notes, status: prev[itemId]?.status || 'ok' }
    }))
  }

  const addDamageRecord = () => {
    const newDamage: DamageRecord = {
      id: `dmg-${Date.now()}`,
      category: selectedTemplate?.damage_categories[0] || 'other',
      location: '',
      severity: 'minor',
      description: '',
      estimated_cost: 0,
    }
    setDamageRecords(prev => [...prev, newDamage])
  }

  const updateDamageRecord = (id: string, updates: Partial<DamageRecord>) => {
    setDamageRecords(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates } : d))
    )
  }

  const removeDamageRecord = (id: string) => {
    setDamageRecords(prev => prev.filter(d => d.id !== id))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!vehicleId) {
      alert('Please select a vehicle')
      return
    }

    createMutation.mutate({
      template_id: templateId,
      agreement_id: agreementId ? parseInt(agreementId) : null,
      vehicle_id: vehicleId,
      inspection_type: inspectionType,
      inspection_datetime: new Date().toISOString(),
      mileage: mileage ? parseInt(mileage) : null,
      fuel_level: parseFloat(fuelLevel),
      checklist_results: checklistResults,
      damage_records: damageRecords,
      condition_rating: conditionRating,
      notes,
    })
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="mb-6 text-2xl font-bold text-gray-800">
        {t('inspections.create.title', 'New Inspection')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Basic Information</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Template</label>
              <select
                value={templateId || ''}
                onChange={(e) => setTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">Select template (optional)</option>
                {templates?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Inspection Type *</label>
              <select
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="pickup">Pickup</option>
                <option value="return">Return</option>
                <option value="periodic">Periodic</option>
                <option value="damage_report">Damage Report</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Vehicle *</label>
              {vehicleId ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{vehicleInfo}</span>
                  <button type="button" onClick={() => setShowVehicleLookup(true)} className="text-sm text-blue-600">Change</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowVehicleLookup(true)}
                  className="w-full rounded-lg border border-dashed px-3 py-2 text-gray-500 hover:border-blue-500"
                >
                  Select vehicle...
                </button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Mileage (km)</label>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fuel Level (%)</label>
              <input
                type="number"
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                min="0"
                max="100"
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Condition Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setConditionRating(rating)}
                    className={`h-10 w-10 rounded-lg border ${
                      conditionRating >= rating ? 'bg-blue-500 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Checklist */}
        {selectedTemplate && groupedItems && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">Checklist</h2>
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h3 className="mb-3 text-sm font-medium uppercase text-gray-500">{category}</h3>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-4 rounded-lg border p-3">
                      <span className="flex-1">{item.label}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleItemStatusChange(item.id, 'ok')}
                          className={`rounded p-1 ${checklistResults[item.id]?.status === 'ok' ? 'bg-green-100 text-green-600' : 'text-gray-400'}`}
                        >
                          <CheckCircle className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemStatusChange(item.id, 'damage')}
                          className={`rounded p-1 ${checklistResults[item.id]?.status === 'damage' ? 'bg-red-100 text-red-600' : 'text-gray-400'}`}
                        >
                          <XCircle className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemStatusChange(item.id, 'na')}
                          className={`rounded p-1 ${checklistResults[item.id]?.status === 'na' ? 'bg-gray-200 text-gray-600' : 'text-gray-400'}`}
                        >
                          <MinusCircle className="h-5 w-5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Notes"
                        value={checklistResults[item.id]?.notes || ''}
                        onChange={(e) => handleItemNotesChange(item.id, e.target.value)}
                        className="w-40 rounded border px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Damage Records */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Damage Records</h2>
            <button
              type="button"
              onClick={addDamageRecord}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-4 w-4" /> Add Damage
            </button>
          </div>
          {damageRecords.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No damage recorded</p>
          ) : (
            <div className="space-y-4">
              {damageRecords.map(damage => (
                <div key={damage.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex justify-between">
                    <span className="font-medium">Damage #{damageRecords.indexOf(damage) + 1}</span>
                    <button type="button" onClick={() => removeDamageRecord(damage.id)} className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={damage.category}
                      onChange={(e) => updateDamageRecord(damage.id, { category: e.target.value })}
                      className="rounded border px-2 py-1"
                    >
                      {(selectedTemplate?.damage_categories || ['scratch', 'dent', 'crack', 'other']).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Location"
                      value={damage.location}
                      onChange={(e) => updateDamageRecord(damage.id, { location: e.target.value })}
                      className="rounded border px-2 py-1"
                    />
                    <select
                      value={damage.severity}
                      onChange={(e) => updateDamageRecord(damage.id, { severity: e.target.value as 'minor' | 'moderate' | 'severe' })}
                      className="rounded border px-2 py-1"
                    >
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Est. Cost"
                      value={damage.estimated_cost || ''}
                      onChange={(e) => updateDamageRecord(damage.id, { estimated_cost: parseFloat(e.target.value) || 0 })}
                      className="rounded border px-2 py-1"
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={damage.description}
                    onChange={(e) => updateDamageRecord(damage.id, { description: e.target.value })}
                    className="mt-2 w-full rounded border px-2 py-1"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Additional Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Enter any additional notes..."
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border px-6 py-2 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !vehicleId}
            className="rounded-lg bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Inspection'}
          </button>
        </div>
      </form>

      {/* Vehicle Lookup */}
      <VehicleLookupModal
        isOpen={showVehicleLookup}
        onClose={() => setShowVehicleLookup(false)}
        onSelect={handleVehicleSelect}
      />
    </div>
  )
}
