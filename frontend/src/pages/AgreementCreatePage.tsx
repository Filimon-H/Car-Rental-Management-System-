import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Search, Car, User, UserCheck, Shield } from 'lucide-react'
import { agreementsService, availabilityService, AvailableVehicle } from '@/services/agreements'
import { CustomerLookupModal } from '@/components/lookup/LookupModal'
import { driversService, Driver } from '@/services/drivers'
import { collateralsService, CollateralPerson } from '@/services/collaterals'
import { customersService } from '@/services/customers'

type AgreementType = 'customer_vehicle' | 'customer_vehicle_driver' | 'vendor_vehicle'

export default function AgreementCreatePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const prefilledCustomerId = searchParams.get('customer_id')

  // Form state
  const [agreementType, setAgreementType] = useState<AgreementType>('customer_vehicle')
  const [customerId, setCustomerId] = useState<number | null>(prefilledCustomerId ? parseInt(prefilledCustomerId, 10) : null)
  const [customerName, setCustomerName] = useState('')
  const [showCustomerLookup, setShowCustomerLookup] = useState(false)

  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersService.getById(customerId as number),
    enabled: !!customerId,
  })

  useEffect(() => {
    if (selectedCustomer?.full_name) setCustomerName(selectedCustomer.full_name)
  }, [selectedCustomer])
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<AvailableVehicle | null>(null)
  const [driverId, setDriverId] = useState<number | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [collateralPersonId, setCollateralPersonId] = useState<number | null>(null)
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralPerson | null>(null)
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('09:00')
  const [returnDate, setReturnDate] = useState('')
  const [returnTime, setReturnTime] = useState('09:00')
  const [dailyRate, setDailyRate] = useState('')
  const [depositAmount, setDepositAmount] = useState('0')
  const [advancePayment, setAdvancePayment] = useState('0')
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [vehicleSearch, setVehicleSearch] = useState('')

  // Fetch available vehicles when dates are selected
  const canCheckAvailability = pickupDate && returnDate && pickupDate <= returnDate
  const startDatetime = canCheckAvailability
    ? `${pickupDate}T${pickupTime}:00`
    : ''
  const endDatetime = canCheckAvailability
    ? `${returnDate}T${returnTime}:00`
    : ''

  const { data: availableVehicles, isLoading: loadingVehicles } = useQuery({
    queryKey: ['availableVehicles', startDatetime, endDatetime],
    queryFn: () => availabilityService.getAvailableVehicles(startDatetime, endDatetime),
    enabled: !!canCheckAvailability,
  })

  // Fetch drivers for selection (only when agreement type requires driver)
  const { data: driversData } = useQuery({
    queryKey: ['drivers-active'],
    queryFn: () => driversService.list({ is_active: true, page_size: 100 }),
    enabled: agreementType === 'customer_vehicle_driver',
  })

  // Fetch collateral persons for selected customer
  const { data: collateralsData } = useQuery({
    queryKey: ['collaterals-customer', customerId],
    queryFn: () => collateralsService.list({ customer_id: customerId!, is_active: true }),
    enabled: !!customerId,
  })

  useEffect(() => {
    if (!customerId) return
    if (collateralPersonId) return
    const first = collateralsData?.items?.[0]
    if (first) {
      setCollateralPersonId(first.id)
      setSelectedCollateral(first)
    }
  }, [customerId, collateralPersonId, collateralsData])

  const insuranceExpiryLabel = useMemo(() => {
    if (!selectedVehicle?.insurance_expiry) return '—'
    return selectedVehicle.insurance_expiry.split('T')[0]
  }, [selectedVehicle?.insurance_expiry])

  const createMutation = useMutation({
    mutationFn: agreementsService.create,
    onSuccess: (agreement) => {
      navigate(`/agreements/${agreement.id}`)
    },
    onError: (error: unknown) => {
      console.error('Agreement creation error:', error)
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || t('agreementCreate.errorCreating'))
    },
  })

  // Calculate rental days and total
  const calculateRentalDays = () => {
    if (!pickupDate || !returnDate) return 0
    const start = new Date(pickupDate)
    const end = new Date(returnDate)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const rentalDays = calculateRentalDays()
  const totalAmount = rentalDays * (parseFloat(dailyRate) || 0)

  const handleVehicleSelect = (vehicle: AvailableVehicle) => {
    setVehicleId(vehicle.id)
    setSelectedVehicle(vehicle)
    setDailyRate(vehicle.daily_rate.toString())
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerId || !vehicleId || !pickupDate || !returnDate || !dailyRate) {
      alert(t('agreementCreate.fillRequiredFields'))
      return
    }

    // Validate driver for driver agreements
    if (agreementType === 'customer_vehicle_driver' && !driverId) {
      alert(t('agreementCreate.selectDriverError'))
      return
    }

    // Validate collateral for customer agreements
    if (!collateralPersonId) {
      alert(t('agreementCreate.selectCollateralError'))
      return
    }

    createMutation.mutate({
      agreement_type: agreementType,
      customer_id: customerId,
      vehicle_id: vehicleId,
      driver_id: driverId || undefined,
      collateral_person_id: collateralPersonId,
      pickup_datetime: `${pickupDate}T${pickupTime}:00Z`,
      expected_return_datetime: `${returnDate}T${returnTime}:00Z`,
      daily_rate: parseFloat(dailyRate),
      deposit_amount: parseFloat(depositAmount) || 0,
      advance_payment: parseFloat(advancePayment) || undefined,
      pickup_location: pickupLocation || undefined,
      return_location: returnLocation || undefined,
      notes: notes || undefined,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/agreements')}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('agreementCreate.backToAgreements')}
      </button>

      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('agreements.createNew')}</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column - Agreement Details */}
        <div className="space-y-6">
          {/* Agreement Type */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.agreementType')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAgreementType('customer_vehicle')}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  agreementType === 'customer_vehicle' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-primary" />
                  <span className="font-medium">{t('agreementCreate.vehicleOnly')}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{t('agreementCreate.vehicleOnlyDesc')}</p>
              </button>
              <button
                type="button"
                onClick={() => setAgreementType('customer_vehicle_driver')}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  agreementType === 'customer_vehicle_driver' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <span className="font-medium">{t('agreementCreate.withDriver')}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{t('agreementCreate.withDriverDesc')}</p>
              </button>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.customer')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.customerRequired')}
                </label>
                {customerId && customerName ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-gray-400" />
                      <span className="font-medium">{customerName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowCustomerLookup(true); setCollateralPersonId(null); setSelectedCollateral(null); }}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('agreementCreate.change')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomerLookup(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-gray-500 hover:border-primary hover:text-primary"
                  >
                    <Search className="h-5 w-5" />
                    {t('agreementCreate.searchCustomer')}
                  </button>
                )}
              </div>

              {selectedCustomer && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.phone')}</span><span className="font-medium">{selectedCustomer.phone_primary || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.id')}</span><span className="font-medium">{selectedCustomer.id_number || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.city')}</span><span className="font-medium">{selectedCustomer.city || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.emergency')}</span><span className="font-medium">{selectedCustomer.emergency_contact_phone || '—'}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collateral Person - Required */}
          {customerId && (
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-orange-500" />
                {t('agreementCreate.collateralPersonRequired')}
              </h2>
              {collateralsData?.items && collateralsData.items.length > 0 ? (
                <div className="space-y-2">
                  {collateralsData.items.map((collateral) => (
                    <div
                      key={collateral.id}
                      onClick={() => { setCollateralPersonId(collateral.id); setSelectedCollateral(collateral); }}
                      className={`cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                        collateralPersonId === collateral.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{collateral.first_name} {collateral.last_name}</div>
                      <div className="text-sm text-gray-500">
                        {collateral.relationship_to_customer || t('agreementCreate.collateral')} • {collateral.phone_primary}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-yellow-50 p-4 text-center text-yellow-700">
                  {t('agreementCreate.noCollateralFound')} <br />
                  <a href="/collaterals" className="font-medium underline">{t('agreementCreate.addCollateralFirst')}</a>
                </div>
              )}

              {selectedCollateral && (
                <div className="mt-4 rounded-lg bg-orange-50 p-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.phone')}</span><span className="font-medium">{selectedCollateral.phone_primary || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.idType')}</span><span className="font-medium">{selectedCollateral.id_type || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.idNumber')}</span><span className="font-medium">{selectedCollateral.id_number || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t('agreementCreate.relationship')}</span><span className="font-medium">{selectedCollateral.relationship_to_customer || '—'}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Driver Selection - Only for driver agreements */}
          {agreementType === 'customer_vehicle_driver' && (
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-500" />
                {t('agreementCreate.selectDriverRequired')}
              </h2>
              {driversData?.items && driversData.items.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {driversData.items.map((driver) => (
                    <div
                      key={driver.id}
                      onClick={() => { setDriverId(driver.id); setSelectedDriver(driver); }}
                      className={`cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                        driverId === driver.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{driver.first_name} {driver.last_name}</div>
                      <div className="text-sm text-gray-500">
                        {t('agreementCreate.license')}: {driver.license_number} • {driver.phone_primary}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-yellow-50 p-4 text-center text-yellow-700">
                  {t('agreementCreate.noActiveDrivers')} <br />
                  <a href="/drivers" className="font-medium underline">{t('agreementCreate.addDriverFirst')}</a>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.rentalPeriod')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.pickupDateRequired')}
                </label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.pickupTime')}
                </label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.returnDateRequired')}
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.returnTime')}
                </label>
                <input
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.pricing')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.dailyRateRequired')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.deposit')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.advancePayment')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t('agreementCreate.optionalAdvance')}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.locationsAndNotes')}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.pickupLocation')}
                </label>
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t('agreementCreate.egOffice')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.returnLocation')}
                </label>
                <input
                  type="text"
                  value={returnLocation}
                  onChange={(e) => setReturnLocation(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t('agreementCreate.egOffice')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('agreementCreate.notes')}
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
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{t('agreementCreate.selectVehicle')}</h2>

            {!canCheckAvailability ? (
              <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">
                {t('agreementCreate.selectDatesFirst')}
              </div>
            ) : loadingVehicles ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : availableVehicles && availableVehicles.length > 0 ? (
              <div className="space-y-3">
                {/* Vehicle Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('agreementCreate.searchVehicle')}
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm"
                  />
                </div>
                {availableVehicles
                  .filter((v) => {
                    if (!vehicleSearch.trim()) return true
                    const search = vehicleSearch.toLowerCase()
                    return (
                      v.vendor_name?.toLowerCase().includes(search) ||
                      v.make.toLowerCase().includes(search) ||
                      v.model.toLowerCase().includes(search) ||
                      v.plate_number.toLowerCase().includes(search) ||
                      v.color?.toLowerCase().includes(search)
                    )
                  })
                  .map((vehicle) => (
                  <div
                    key={vehicle.id}
                    onClick={() => handleVehicleSelect(vehicle)}
                    className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                      vehicleId === vehicle.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Car className="h-10 w-10 text-gray-400" />
                      <div className="flex-1">
                        <div className="font-semibold">
                          {vehicle.make} {vehicle.model} ({vehicle.year})
                        </div>
                        <div className="text-sm text-gray-500">
                          {vehicle.plate_number} • {vehicle.vendor_name} • {vehicle.color} • {vehicle.seats} {t('agreementCreate.seats')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-primary">
                          {formatCurrency(vehicle.daily_rate)}
                        </div>
                        <div className="text-xs text-gray-500">{t('agreementCreate.perDay')}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-yellow-50 p-8 text-center text-yellow-700">
                {t('agreementCreate.noVehiclesAvailable')}
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedVehicle && dailyRate && pickupDate && returnDate && (
            <div className="rounded-lg bg-primary/5 p-6">
              <h3 className="mb-3 font-semibold text-primary">{t('agreementCreate.agreementSummary')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t('agreementCreate.vehicle')}</span>
                  <span className="font-medium">
                    {selectedVehicle.make} {selectedVehicle.model}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.plate')}</span>
                  <span className="font-medium">{selectedVehicle.plate_number} ({selectedVehicle.plate_code})</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.serviceType')}</span>
                  <span className="font-medium">{selectedVehicle.service_type || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.fuelType')}</span>
                  <span className="font-medium">{selectedVehicle.fuel_type || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.insuranceExpiry')}</span>
                  <span className="font-medium">{insuranceExpiryLabel}</span>
                </div>
                {selectedDriver && (
                  <div className="flex justify-between">
                    <span>{t('agreementCreate.driver')}</span>
                    <span className="font-medium">
                      {selectedDriver.first_name} {selectedDriver.last_name}
                    </span>
                  </div>
                )}
                {selectedCollateral && (
                  <div className="flex justify-between">
                    <span>{t('agreementCreate.collateral')}</span>
                    <span className="font-medium">
                      {selectedCollateral.first_name} {selectedCollateral.last_name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{t('agreementCreate.rentalPeriod')}</span>
                  <span className="font-medium">{rentalDays} {rentalDays !== 1 ? t('agreementCreate.days') : t('agreementCreate.day')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.dailyRate')}</span>
                  <span className="font-medium">{formatCurrency(parseFloat(dailyRate))}</span>
                </div>
                <hr className="my-2 border-gray-300" />
                <div className="flex justify-between text-base font-semibold">
                  <span>{t('agreementCreate.totalRental')}</span>
                  <span className="text-primary">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('agreementCreate.deposit')}</span>
                  <span className="font-medium">
                    {formatCurrency(parseFloat(depositAmount) || 0)}
                  </span>
                </div>
                {parseFloat(advancePayment) > 0 && (
                  <div className="flex justify-between">
                    <span>{t('agreementCreate.advancePayment')}</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(parseFloat(advancePayment))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={createMutation.isPending || !customerId || !vehicleId}
            className="w-full rounded-lg bg-primary py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {createMutation.isPending ? t('agreementCreate.creating') : t('agreementCreate.createAgreement')}
          </button>

          {createMutation.isError && (
            <div className="rounded-lg bg-red-50 p-4 text-red-600">
              {t('agreementCreate.errorCreating')}
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
          setCollateralPersonId(null)
          setSelectedCollateral(null)
          setShowCustomerLookup(false)
        }}
      />
    </div>
  )
}
