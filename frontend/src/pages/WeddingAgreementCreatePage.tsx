import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Search, Car, User, Heart, Plus, Trash2 } from 'lucide-react'
import { availabilityService, AvailableVehicle } from '@/services/agreements'
import apiClient from '@/services/apiClient'
import { CustomerLookupModal } from '@/components/lookup/LookupModal'

interface SelectedVehicle {
  vehicle: AvailableVehicle
  dailyRate: number
  startDate: string
  endDate: string
}

export default function WeddingAgreementCreatePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Form state
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [showCustomerLookup, setShowCustomerLookup] = useState(false)
  
  // Wedding-specific fields
  const [eventDate, setEventDate] = useState('')
  const [eventEndDate, setEventEndDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventTime, setEventTime] = useState('09:00')
  
  // Multi-vehicle selection
  const [selectedVehicles, setSelectedVehicles] = useState<SelectedVehicle[]>([])
  const [vehicleSearch, setVehicleSearch] = useState('')
  
  // Other fields
  const [depositAmount, setDepositAmount] = useState('0')
  const [advancePayment, setAdvancePayment] = useState('0')
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch available vehicles when event dates are selected
  const canCheckAvailability = eventDate && eventEndDate && eventDate <= eventEndDate
  const startDatetime = canCheckAvailability ? `${eventDate}T${eventTime}:00` : ''
  const endDatetime = canCheckAvailability ? `${eventEndDate}T23:59:00` : ''

  const { data: availableVehicles, isLoading: loadingVehicles } = useQuery({
    queryKey: ['availableVehicles', startDatetime, endDatetime],
    queryFn: () => availabilityService.getAvailableVehicles(startDatetime, endDatetime),
    enabled: !!canCheckAvailability,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      // Build vehicles array for wedding agreement (matching backend schema)
      const vehicles = selectedVehicles.map((sv) => ({
        vehicle_id: sv.vehicle.id,
        daily_rate: sv.dailyRate,
        start_datetime: `${sv.startDate}T${eventTime}:00`,
        end_datetime: `${sv.endDate}T23:59:00`,
      }))

      const payload = {
        customer_id: customerId,
        vehicles: vehicles,
        event_date: `${eventDate}T${eventTime}:00`,
        event_end_date: eventEndDate ? `${eventEndDate}T23:59:00` : undefined,
        deposit_amount: parseFloat(depositAmount) || 0,
        pickup_location: pickupLocation || undefined,
        return_location: returnLocation || undefined,
        notes: notes || undefined,
      }

      try {
        return await apiClient.post<{ id: number }>('/agreements/wedding', payload)
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string }
        const detail = error?.response?.data?.detail || error?.message
        throw new Error(detail || t('weddingAgreementCreate.errorCreating'))
      }
    },
    onSuccess: (agreement) => {
      navigate(`/agreements/${agreement.id}`)
    },
    onError: (error: unknown) => {
      console.error('Wedding agreement creation error:', error)
      const err = error as Error
      alert(err?.message || t('weddingAgreementCreate.errorCreating'))
    },
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  // Calculate totals
  const calculateVehicleDays = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 1
  }

  const totalVehicleAmount = selectedVehicles.reduce((sum, sv) => {
    const days = calculateVehicleDays(sv.startDate, sv.endDate)
    return sum + sv.dailyRate * days
  }, 0)

  const handleAddVehicle = (vehicle: AvailableVehicle) => {
    // Check if already added
    if (selectedVehicles.some((sv) => sv.vehicle.id === vehicle.id)) {
      return
    }

    setSelectedVehicles([
      ...selectedVehicles,
      {
        vehicle,
        dailyRate: vehicle.daily_rate,
        startDate: eventDate,
        endDate: eventEndDate,
      },
    ])
  }

  const handleRemoveVehicle = (vehicleId: number) => {
    setSelectedVehicles(selectedVehicles.filter((sv) => sv.vehicle.id !== vehicleId))
  }

  const handleUpdateVehicleRate = (vehicleId: number, rate: number) => {
    setSelectedVehicles(
      selectedVehicles.map((sv) =>
        sv.vehicle.id === vehicleId ? { ...sv, dailyRate: rate } : sv
      )
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerId) {
      alert(t('weddingAgreementCreate.selectCustomerError'))
      return
    }

    if (selectedVehicles.length === 0) {
      alert(t('weddingAgreementCreate.selectVehicleError'))
      return
    }

    if (!eventDate || !eventEndDate) {
      alert(t('weddingAgreementCreate.selectDatesError'))
      return
    }

    createMutation.mutate()
  }

  // Filter available vehicles (exclude already selected)
  const filteredVehicles = availableVehicles?.filter((v) => {
    // Exclude already selected
    if (selectedVehicles.some((sv) => sv.vehicle.id === v.id)) {
      return false
    }
    // Apply search filter
    if (!vehicleSearch.trim()) return true
    const search = vehicleSearch.toLowerCase()
    return (
      v.vendor_name?.toLowerCase().includes(search) ||
      v.make.toLowerCase().includes(search) ||
      v.model.toLowerCase().includes(search) ||
      v.plate_number.toLowerCase().includes(search)
    )
  })

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/agreements/wedding')}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('weddingAgreementCreate.backToAgreements')}
      </button>

      <div className="mb-6 flex items-center gap-3">
        <Heart className="h-8 w-8 text-pink-500" />
        <h1 className="text-2xl font-bold text-gray-800">{t('weddingAgreementCreate.title')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column - Agreement Details */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('weddingAgreementCreate.customer')}</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('weddingAgreementCreate.customerRequired')}
              </label>
              {customerId && customerName ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-400" />
                    <span className="font-medium">{customerName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomerLookup(true)}
                    className="text-sm text-pink-500 hover:underline"
                  >
                    {t('weddingAgreementCreate.change')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomerLookup(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-gray-500 hover:border-pink-500 hover:text-pink-500"
                >
                  <Search className="h-5 w-5" />
                  {t('weddingAgreementCreate.searchCustomer')}
                </button>
              )}
            </div>
          </div>

          {/* Event Details */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              {t('weddingAgreementCreate.eventDetails')}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.eventStartDate')}
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value)
                    if (!eventEndDate || e.target.value > eventEndDate) {
                      setEventEndDate(e.target.value)
                    }
                  }}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.eventEndDate')}
                </label>
                <input
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  min={eventDate}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.eventTime')}
                </label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.eventLocation')}
                </label>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder={t('weddingAgreementCreate.egAddisAbaba')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('weddingAgreementCreate.pricing')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.deposit')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.advancePayment')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Locations & Notes */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('weddingAgreementCreate.locationsAndNotes')}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.pickupLocation')}
                </label>
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t('weddingAgreementCreate.egOffice')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.returnLocation')}
                </label>
                <input
                  type="text"
                  value={returnLocation}
                  onChange={(e) => setReturnLocation(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t('weddingAgreementCreate.egOffice')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('weddingAgreementCreate.notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Vehicle Selection */}
        <div className="space-y-6">
          {/* Selected Vehicles */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <Car className="h-5 w-5 text-pink-500" />
              {t('weddingAgreementCreate.selectedVehicles')} ({selectedVehicles.length})
            </h2>

            {selectedVehicles.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-4 text-center text-gray-500">
                {t('weddingAgreementCreate.noVehiclesSelected')}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedVehicles.map((sv) => {
                  const days = calculateVehicleDays(sv.startDate, sv.endDate)
                  const subtotal = sv.dailyRate * days
                  return (
                    <div
                      key={sv.vehicle.id}
                      className="rounded-lg border border-pink-200 bg-pink-50 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold">
                            {sv.vehicle.make} {sv.vehicle.model}
                          </div>
                          <div className="text-sm text-gray-500">
                            {sv.vehicle.plate_number} • {sv.vehicle.color}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveVehicle(sv.vehicle.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">{t('weddingAgreementCreate.dailyRate')}</label>
                          <input
                            type="number"
                            value={sv.dailyRate}
                            onChange={(e) =>
                              handleUpdateVehicleRate(sv.vehicle.id, parseFloat(e.target.value) || 0)
                            }
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">{t('weddingAgreementCreate.days')}</label>
                          <div className="rounded border bg-gray-100 px-2 py-1 text-sm">
                            {days}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">{t('weddingAgreementCreate.subtotal')}</label>
                          <div className="rounded border bg-gray-100 px-2 py-1 text-sm font-medium">
                            {formatCurrency(subtotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Total */}
                <div className="rounded-lg bg-pink-100 p-4">
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>{t('weddingAgreementCreate.totalVehicleAmount')}</span>
                    <span className="text-pink-700">{formatCurrency(totalVehicleAmount)}</span>
                  </div>
                  {parseFloat(advancePayment) > 0 && (
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span>{t('weddingAgreementCreate.lessAdvancePayment')}</span>
                      <span className="text-green-600">
                        -{formatCurrency(parseFloat(advancePayment))}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between font-semibold">
                    <span>{t('weddingAgreementCreate.balanceDue')}</span>
                    <span>
                      {formatCurrency(totalVehicleAmount - (parseFloat(advancePayment) || 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Available Vehicles */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('weddingAgreementCreate.addVehicles')}</h2>

            {!canCheckAvailability ? (
              <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">
                {t('weddingAgreementCreate.selectDatesFirst')}
              </div>
            ) : loadingVehicles ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
              </div>
            ) : filteredVehicles && filteredVehicles.length > 0 ? (
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('weddingAgreementCreate.searchVehicles')}
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm"
                  />
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {filteredVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <Car className="h-8 w-8 text-gray-400" />
                        <div>
                          <div className="font-medium">
                            {vehicle.make} {vehicle.model}
                          </div>
                          <div className="text-sm text-gray-500">
                            {vehicle.plate_number} • {formatCurrency(vehicle.daily_rate)}/day
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddVehicle(vehicle)}
                        className="flex items-center gap-1 rounded-lg bg-pink-500 px-3 py-1 text-sm text-white hover:bg-pink-600"
                      >
                        <Plus className="h-4 w-4" />
                        {t('weddingAgreementCreate.add')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-yellow-50 p-8 text-center text-yellow-700">
                {availableVehicles?.length === 0
                  ? t('weddingAgreementCreate.noVehiclesAvailable')
                  : t('weddingAgreementCreate.allVehiclesAdded')}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={createMutation.isPending || !customerId || selectedVehicles.length === 0}
            className="w-full rounded-lg bg-pink-500 py-3 font-semibold text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {createMutation.isPending ? t('weddingAgreementCreate.creating') : t('weddingAgreementCreate.createAgreement')}
          </button>

          {createMutation.isError && (
            <div className="rounded-lg bg-red-50 p-4 text-red-600">
              {t('weddingAgreementCreate.errorCreating')}
            </div>
          )}
        </div>
      </form>

      {/* Customer Lookup Modal */}
      <CustomerLookupModal
        isOpen={showCustomerLookup}
        onClose={() => setShowCustomerLookup(false)}
        onSelect={(customer) => {
          setCustomerId(customer.id)
          setCustomerName(customer.full_name)
          setShowCustomerLookup(false)
        }}
      />
    </div>
  )
}
