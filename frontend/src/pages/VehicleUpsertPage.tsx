import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Building2, Search } from 'lucide-react'
import { vehiclesService, CreateVehicleData, LookupValue } from '@/services/vehicles'
import { vendorsService, Vendor } from '@/services/vendors'
import { lookupsService } from '@/services/lookups'

const PLATE_CODE_OPTIONS: LookupValue[] = [
  { value: '01', label: '01' },
  { value: '02', label: '02' },
  { value: '03', label: '03' },
  { value: '05', label: '05' },
  { value: 'daily', label: 'Daily' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'other', label: 'Other' },
]

const PLATE_CITY_OPTIONS = ['AA', 'Oromiya', 'Sheger city']

const SERVICE_TYPE_OPTIONS: LookupValue[] = [
  { value: 'business', label: 'Business' },
  { value: 'field_work', label: 'Field' },
  { value: 'wedding', label: 'WEDDING' },
  { value: 'luxury', label: 'LUXURY' },
  { value: 'other', label: 'OTHER' },
]

const FUEL_TYPE_OPTIONS: LookupValue[] = [
  { value: 'petrol', label: 'Benzin' },
  { value: 'diesel', label: 'Disel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'gas', label: 'Gas' },
  { value: 'natural_gas', label: 'Natural Gas' },
]

const COLOR_OPTIONS = [
  'Black',
  'White',
  'Silver',
  'Gray',
  'Blue',
  'Red',
  'Green',
  'Yellow',
  'Brown',
  'Beige',
  'Orange',
  'Purple',
  'Gold',
  'Other',
]

const VEHICLE_TYPE_OPTIONS: LookupValue[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'compact', label: 'Compact' },
  { value: 'sport_car', label: 'Sport Car' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'convertible', label: 'convertable' },
  { value: 'pickup_truck', label: 'Pickup Truck' },
  { value: 'van', label: 'Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'suv', label: 'SUV' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'other', label: 'Other' },
]

const CONDITION_OPTIONS: LookupValue[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'risky', label: 'Risky' },
]

const MODEL_OPTIONS: LookupValue[] = [
  { value: 'suzuki_desire', label: 'Suzuki desire' },
  { value: 'corollal', label: 'Colloral' },
  { value: 'vitz', label: 'Vitz' },
  { value: 'minibus', label: 'Minibus' },
  { value: 'suzuki_swift', label: 'Suzuki swift' },
  { value: 'toyota_corolla', label: 'Toyota Corolla' },
  { value: 'honda_civic', label: 'Honda Civic' },
  { value: 'ford_f150', label: 'Ford F-150' },
  { value: 'chevrolet_silverado', label: 'Chevrolet Silverado' },
  { value: 'bmw_x5', label: 'BMW X5' },
  { value: 'mercedes_c_class', label: 'Mercedes-Benz C-Class' },
  { value: 'tesla_model_3', label: 'Tesla Model 3' },
  { value: 'nissan_altima', label: 'Nissan Altima' },
]

const MAKE_OPTIONS = [
  'Suzuki',
  'Toyota',
  'Honda',
  'Ford',
  'Chevrolet',
  'BMW',
  'Mercedes-Benz',
  'Tesla',
  'Nissan',
]

export default function VehicleUpsertPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const vehicleIdNum = vehicleId ? parseInt(vehicleId, 10) : null
  const isEdit = !!vehicleIdNum

  const [photoFiles, setPhotoFiles] = useState<{
    front?: File | null
    back?: File | null
    left?: File | null
    right?: File | null
  }>({})

  const { data: lookupDefaults } = useQuery({
    queryKey: ['lookups-defaults'],
    queryFn: () => lookupsService.getDefaults(),
  })

  const [step, setStep] = useState<'vendor' | 'vehicle'>(isEdit ? 'vehicle' : 'vendor')
  const [vendorSearch, setVendorSearch] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-search', vendorSearch],
    queryFn: () => vendorsService.list({ search: vendorSearch || undefined, page_size: 50 }),
    enabled: step === 'vendor',
  })

  const { data: vehicle, isLoading: loadingVehicle } = useQuery({
    queryKey: ['vehicle', vehicleIdNum],
    queryFn: () => vehiclesService.getById(vehicleIdNum as number),
    enabled: !!vehicleIdNum,
  })

  const [formData, setFormData] = useState<CreateVehicleData>({
    vendor_id: 0,
    plate_number: '',
    plate_code: '03',
    plate_city: 'AA',
    make: 'Toyota',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    vehicle_type: 'standard',
    service_type: 'business',
    car_condition: 'good',
    motor_number: '',
    chassis_number: '',
    seats: 5,
    transmission: 'automatic',
    fuel_type: 'petrol',
    daily_rate: 0,
    current_mileage: undefined,
    insurance_policy_number: '',
    insurance_expiry: undefined,
    notes: '',
  })

  const mapVendorSummaryToVendor = (v: { id: number; vendor_type: string; company_name?: string | null; contact_person?: string | null; phone_primary: string; email?: string | null }): Vendor => {
    return {
      id: v.id,
      vendor_type: v.vendor_type as 'company' | 'individual',
      company_name: v.company_name ?? null,
      contact_person: v.contact_person ?? null,
      phone_primary: v.phone_primary,
      phone_secondary: null,
      email: v.email ?? null,
      address: null,
      city: null,
      bank_name: null,
      bank_account_number: null,
      bank_account_holder: null,
      commission_rate: 70,
      notes: null,
      is_active: true,
      created_at: '',
      updated_at: '',
    }
  }

  useEffect(() => {
    if (!vehicle) return

    setSelectedVendor(vehicle.vendor ? mapVendorSummaryToVendor(vehicle.vendor) : null)
    setFormData({
      vendor_id: vehicle.vendor_id,
      plate_number: vehicle.plate_number || '',
      plate_code: vehicle.plate_code || '03',
      plate_city: vehicle.plate_city || 'AA',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || new Date().getFullYear(),
      color: vehicle.color || '',
      vehicle_type: vehicle.vehicle_type || 'standard',
      service_type: vehicle.service_type || 'business',
      car_condition: vehicle.car_condition || 'good',
      motor_number: vehicle.motor_number || '',
      chassis_number: vehicle.chassis_number || '',
      seats: vehicle.seats || 5,
      transmission: vehicle.transmission || 'automatic',
      fuel_type: vehicle.fuel_type || 'petrol',
      daily_rate: vehicle.daily_rate || 0,
      current_mileage: vehicle.current_mileage ?? undefined,
      insurance_policy_number: vehicle.insurance_policy_number || '',
      insurance_expiry: vehicle.insurance_expiry || undefined,
      notes: vehicle.notes || '',
    })
  }, [vehicle])

  const createMutation = useMutation({
    mutationFn: vehiclesService.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      navigate('/vehicles')
      return created
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || t('vehicleUpsert.errorCreating'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateVehicleData>) => vehiclesService.update(vehicleIdNum as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleIdNum] })
      navigate('/vehicles')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || t('vehicleUpsert.errorUpdating'))
    },
  })

  const isLoading = createMutation.isPending || updateMutation.isPending || loadingVehicle

  const defaultsToLookupOptions = useCallback((category: string): LookupValue[] => {
    const list = lookupDefaults?.[category] || []
    return list.map((i) => ({ value: i.value, label: i.label }))
  }, [lookupDefaults])

  const defaultsToStringOptions = useCallback((category: string): string[] => {
    const list = lookupDefaults?.[category] || []
    return list.map((i) => i.label || i.value)
  }, [lookupDefaults])

  const ensureLookupValue = useCallback((options: LookupValue[], value: string | undefined | null): LookupValue[] => {
    if (!value) return options
    if (options.some((o) => o.value === value)) return options
    return [...options, { value, label: value }]
  }, [])

  const ensureStringValue = useCallback((options: string[], value: string | undefined | null): string[] => {
    if (!value) return options
    if (options.includes(value)) return options
    return [...options, value]
  }, [])

  const plateCodeOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('plate_code')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : PLATE_CODE_OPTIONS, formData.plate_code)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.plate_code])

  const plateCityOptions = useMemo(() => {
    const fromDefaults = defaultsToStringOptions('plate_city')
    return ensureStringValue(fromDefaults.length ? fromDefaults : PLATE_CITY_OPTIONS, formData.plate_city)
  }, [defaultsToStringOptions, ensureStringValue, formData.plate_city])

  const makeOptions = useMemo(() => {
    const fromDefaults = defaultsToStringOptions('make')
    return ensureStringValue(fromDefaults.length ? fromDefaults : MAKE_OPTIONS, formData.make)
  }, [defaultsToStringOptions, ensureStringValue, formData.make])

  const modelOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('car_model')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : MODEL_OPTIONS, formData.model)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.model])

  const colorOptions = useMemo(() => {
    const fromDefaults = defaultsToStringOptions('color')
    return ensureStringValue(fromDefaults.length ? fromDefaults : COLOR_OPTIONS, formData.color)
  }, [defaultsToStringOptions, ensureStringValue, formData.color])

  const vehicleTypeOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('vehicle_type')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : VEHICLE_TYPE_OPTIONS, formData.vehicle_type)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.vehicle_type])

  const serviceTypeOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('service_type')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : SERVICE_TYPE_OPTIONS, formData.service_type)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.service_type])

  const fuelTypeOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('fuel_type')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : FUEL_TYPE_OPTIONS, formData.fuel_type)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.fuel_type])

  const conditionOptions = useMemo(() => {
    const fromDefaults = defaultsToLookupOptions('car_condition')
    return ensureLookupValue(fromDefaults.length ? fromDefaults : CONDITION_OPTIONS, formData.car_condition)
  }, [defaultsToLookupOptions, ensureLookupValue, formData.car_condition])

  const canSave = useMemo(() => {
    const hasErrors = Boolean(false)
    return !isLoading && !hasErrors && !!formData.vendor_id
  }, [formData.vendor_id, isLoading])

  const handleVendorSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor)
    setFormData((p) => ({ ...p, vendor_id: vendor.id }))
    setStep('vehicle')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return

    const hasPhotos = Boolean(photoFiles.front || photoFiles.back || photoFiles.left || photoFiles.right)

    if (isEdit) {
      await updateMutation.mutateAsync(formData)

      if (hasPhotos && vehicleIdNum) {
        await vehiclesService.uploadPhotos(vehicleIdNum, photoFiles)
        queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleIdNum] })
      }
      return
    }

    const created = await createMutation.mutateAsync(formData)
    if (hasPhotos && created?.id) {
      await vehiclesService.uploadPhotos(created.id, photoFiles)
    }
  }

  const insuranceExpiryDateValue = useMemo(() => {
    if (!formData.insurance_expiry) return ''
    return formData.insurance_expiry.split('T')[0]
  }, [formData.insurance_expiry])

  const existingPhotos = useMemo(() => {
    return {
      front: vehicle?.photo_front || null,
      back: vehicle?.photo_back || null,
      left: vehicle?.photo_left || null,
      right: vehicle?.photo_right || null,
    }
  }, [vehicle])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/vehicles')} className="rounded-lg p-2 hover:bg-gray-100" title={t('common.back')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? t('vehicleUpsert.editVehicle') : t('vehicleUpsert.addVehicle')}</h1>
            <p className="text-sm text-gray-500">{step === 'vendor' ? t('vehicleUpsert.selectVendorFirst') : t('vehicleUpsert.vehicleDetails')}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {step === 'vendor' && !isEdit && (
            <div className="rounded-lg border bg-white p-6">
              <p className="mb-4 text-gray-600">{t('vehicleUpsert.selectVendorInstruction')}</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('vehicleUpsert.searchVendors')}
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border">
                {vendorsData?.items.map((vendor) => (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => handleVendorSelect(vendor)}
                    className="flex w-full items-center gap-2 border-b p-3 text-left hover:bg-gray-50 last:border-b-0"
                  >
                    <Building2 className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium">
                        {vendor.vendor_type === 'company' ? vendor.company_name : vendor.contact_person}
                      </div>
                      <div className="text-sm text-gray-500">{vendor.phone_primary}</div>
                    </div>
                  </button>
                ))}
                {vendorsData?.items.length === 0 && (
                  <div className="p-4 text-center text-gray-500">{t('vehicleUpsert.noVendorsFound')}</div>
                )}
              </div>
            </div>
          )}

          {step === 'vehicle' && (
            <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6">
              {selectedVendor && (
                <div className="mb-6 rounded-lg bg-blue-50 p-4">
                  <div className="text-sm font-medium text-blue-800">{t('vehicleUpsert.vendor')}</div>
                  <div className="text-blue-900">
                    {selectedVendor.vendor_type === 'company' ? selectedVendor.company_name : selectedVendor.contact_person}
                    {' • '}{selectedVendor.phone_primary}
                  </div>
                  {!isEdit && (
                    <button type="button" onClick={() => setStep('vendor')} className="mt-1 text-sm text-blue-600 hover:underline">
                      {t('vehicleUpsert.changeVendor')}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.plateNumberRequired')}</label>
                  <input
                    type="text"
                    value={formData.plate_number}
                    onChange={(e) => setFormData((p) => ({ ...p, plate_number: e.target.value }))}
                    required
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="12345"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.plateCodeRequired')}</label>
                  <select
                    value={formData.plate_code}
                    onChange={(e) => setFormData((p) => ({ ...p, plate_code: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {plateCodeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.plateCity')}</label>
                  <select
                    value={formData.plate_city || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, plate_city: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">{t('vehicleUpsert.selectPlateCity')}</option>
                    {plateCityOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.make')}</label>
                  <select
                    value={formData.make}
                    onChange={(e) => setFormData((p) => ({ ...p, make: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">{t('vehicleUpsert.selectMake')}</option>
                    {makeOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.modelRequired')}</label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))}
                    required
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">{t('vehicleUpsert.selectModel')}</option>
                    {modelOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.yearRequired')}</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData((p) => ({ ...p, year: parseInt(e.target.value, 10) }))}
                    required
                    min={1990}
                    max={2030}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.colorRequired')}</label>
                  <select
                    value={formData.color}
                    onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
                    required
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">{t('vehicleUpsert.selectColor')}</option>
                    {colorOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.seats')}</label>
                  <input
                    type="number"
                    value={formData.seats}
                    onChange={(e) => setFormData((p) => ({ ...p, seats: parseInt(e.target.value, 10) }))}
                    min={1}
                    max={50}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.vehicleTypeRequired')}</label>
                  <select
                    value={formData.vehicle_type}
                    onChange={(e) => setFormData((p) => ({ ...p, vehicle_type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {vehicleTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.serviceTypeRequired')}</label>
                  <select
                    value={formData.service_type}
                    onChange={(e) => setFormData((p) => ({ ...p, service_type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {serviceTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.conditionRequired')}</label>
                  <select
                    value={formData.car_condition}
                    onChange={(e) => setFormData((p) => ({ ...p, car_condition: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {conditionOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.fuelType')}</label>
                  <select
                    value={formData.fuel_type}
                    onChange={(e) => setFormData((p) => ({ ...p, fuel_type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {fuelTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.motorNumber')}</label>
                  <input
                    type="text"
                    value={formData.motor_number || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, motor_number: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.chassisNumber')}</label>
                  <input
                    type="text"
                    value={formData.chassis_number || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, chassis_number: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.insurancePolicyNumber')}</label>
                  <input
                    type="text"
                    value={formData.insurance_policy_number || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, insurance_policy_number: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.insuranceExpiry')}</label>
                  <input
                    type="date"
                    value={insuranceExpiryDateValue}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        insurance_expiry: e.target.value ? e.target.value : undefined,
                      }))
                    }
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-6 rounded-lg border bg-gray-50 p-4">
                <div className="mb-3 text-sm font-medium text-gray-700">{t('vehicleUpsert.vehiclePhotos')}</div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <PhotoDropzone
                    label={t('vehicleUpsert.frontView')}
                    existingPath={existingPhotos.front}
                    onFileSelected={(file: File | null) => setPhotoFiles((p) => ({ ...p, front: file }))}
                    t={t}
                  />
                  <PhotoDropzone
                    label={t('vehicleUpsert.backView')}
                    existingPath={existingPhotos.back}
                    onFileSelected={(file: File | null) => setPhotoFiles((p) => ({ ...p, back: file }))}
                    t={t}
                  />
                  <PhotoDropzone
                    label={t('vehicleUpsert.leftView')}
                    existingPath={existingPhotos.left}
                    onFileSelected={(file: File | null) => setPhotoFiles((p) => ({ ...p, left: file }))}
                    t={t}
                  />
                  <PhotoDropzone
                    label={t('vehicleUpsert.rightView')}
                    existingPath={existingPhotos.right}
                    onFileSelected={(file: File | null) => setPhotoFiles((p) => ({ ...p, right: file }))}
                    t={t}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500">{t('vehicleUpsert.photoUploadHint')}</div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.transmission')}</label>
                  <select
                    value={formData.transmission}
                    onChange={(e) => setFormData((p) => ({ ...p, transmission: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="automatic">{t('vehicleUpsert.automatic')}</option>
                    <option value="manual">{t('vehicleUpsert.manual')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.dailyRateRequired')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.daily_rate}
                    onChange={(e) => setFormData((p) => ({ ...p, daily_rate: parseFloat(e.target.value) }))}
                    required
                    min={0}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="mb-1 block text-sm font-medium">{t('vehicleUpsert.notes')}</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => navigate('/vehicles')} className="rounded-lg border px-4 py-2 hover:bg-gray-50">
                  {t('vehicleUpsert.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {isLoading ? t('vehicleUpsert.saving') : t('vehicleUpsert.save')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function PhotoDropzone({
  label,
  existingPath,
  onFileSelected,
  t,
}: {
  label: string
  existingPath: string | null
  onFileSelected: (file: File | null) => void
  t: (key: string) => string
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const existingUrl = useMemo(() => {
    if (!existingPath) return null
    const cleaned = existingPath.startsWith('/') ? existingPath.slice(1) : existingPath
    return `/api/uploads/${cleaned}`
  }, [existingPath])

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      onFileSelected(file)
    },
    [onFileSelected, previewUrl]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const shown = previewUrl || existingUrl

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer overflow-hidden rounded-lg border-2 border-dashed bg-white transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
        <div className="flex h-56 items-center justify-center">
          {shown ? (
            <img src={shown} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="text-sm text-gray-500">{t('vehicleUpsert.dropImageHere')}</div>
          )}
        </div>
      </div>
      {(previewUrl || existingUrl) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl)
              setPreviewUrl(null)
            }
            onFileSelected(null)
          }}
          className="text-xs text-red-600 hover:underline"
        >
          {t('vehicleUpsert.remove')}
        </button>
      )}
    </div>
  )
}
