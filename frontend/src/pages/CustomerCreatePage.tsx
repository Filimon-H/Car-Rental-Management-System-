import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Building2, CheckCircle, AlertTriangle, ExternalLink, Upload, X } from 'lucide-react'
import { customersService, CreateCustomerData, DuplicateCheckResult } from '@/services/customers'
import { DocumentDropzone } from '@/components/documents/DocumentDropzone'
import { customerDocumentsService, DocumentType } from '@/services/customerDocuments'

// Phone normalization: 09XXXXXXXX -> +2519XXXXXXXX
function normalizeEthiopianPhone(phone: string): string {
  if (!phone) return phone
  const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '')
  if (cleaned.startsWith('09') && cleaned.length === 10) {
    return '+251' + cleaned.slice(1)
  }
  if (cleaned.startsWith('9') && cleaned.length === 9) {
    return '+251' + cleaned
  }
  return phone
}

// Auto-capitalize first letter of each word
function capitalizeWords(str: string): string {
  if (!str) return str
  return str.replace(/\b\w/g, (char) => char.toUpperCase())
}

const SUBCITIES = [
  'Addis Ketema', 'Akaky Kaliti', 'Arada', 'Bole', 'Gullele',
  'Kirkos', 'Kolfe Keranio', 'Lideta', 'Nifas Silk-Lafto', 'Yeka', 'Lemi Kura'
]

const DRAFT_STORAGE_KEY = 'customer_create_draft'

// Default form values
const defaultFormData: CreateCustomerData = {
  business_type: 'individual',
  company_name: '',
  tin_number: '',
  first_name: '',
  last_name: '',
  phone_primary: '',
  phone_secondary: '',
  email: '',
  id_type: 'passport',
  id_number: '',
  driver_license_number: '',
  house_number: '',
  wereda: '',
  subcity: '',
  city: 'Addis Ababa',
  notes: '',
}

// Load draft from localStorage
function loadDraft(): CreateCustomerData | null {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Validate it has expected structure
      if (parsed && typeof parsed === 'object' && 'first_name' in parsed) {
        return { ...defaultFormData, ...parsed }
      }
    }
  } catch (e) {
    console.error('Failed to load draft:', e)
  }
  return null
}

// Save draft to localStorage
function saveDraft(data: CreateCustomerData): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save draft:', e)
  }
}

// Clear draft from localStorage
function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear draft:', e)
  }
}

export default function CustomerCreatePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Initialize form with draft or defaults
  const [formData, setFormData] = useState<CreateCustomerData>(() => {
    return loadDraft() || defaultFormData
  })
  
  // Track if we loaded from a draft
  const [hasDraft, setHasDraft] = useState(() => !!loadDraft())

  // Auto-save draft on form changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Only save if there's meaningful data
      if (formData.first_name || formData.last_name || formData.phone_primary) {
        saveDraft(formData)
        setHasDraft(true)
      }
    }, 1000) // Debounce 1 second
    
    return () => clearTimeout(timeoutId)
  }, [formData])

  // Clear draft handler
  const handleClearDraft = () => {
    clearDraft()
    setFormData(defaultFormData)
    setHasDraft(false)
  }

  const isIndividual = formData.business_type === 'individual'

  // Track which sections are complete for the checklist
  const isPersonalComplete = !!(formData.first_name && formData.last_name)
  const isContactComplete = !!formData.phone_primary
  const isIdComplete = isIndividual ? !!(formData.id_type && formData.id_number && formData.driver_license_number) : true
  const isAddressComplete = !!formData.city

  // Duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [showPhoneDuplicateModal, setShowPhoneDuplicateModal] = useState(false)
  const [pendingSaveAction, setPendingSaveAction] = useState<'close' | 'next' | null>(null)

  // Staged documents (Create page has no customerId yet)
  const [stagedDocuments, setStagedDocuments] = useState<Partial<Record<DocumentType, File>>>({})

  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone_primary?: string; phone_secondary?: string }>({})
  const [emailTouched, setEmailTouched] = useState(false)

  const validateEmail = (value: string): string | undefined => {
    if (!value) return undefined
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value) ? undefined : 'Invalid email format. Example: name@example.com'
  }

  const validatePhone = (value: string): string | undefined => {
    if (!value) return undefined
    const cleaned = value.replace(/\s+/g, '').replace(/-/g, '')

    // Progressive validation:
    // - Allow typing if starts with 09, 2519, or +2519
    // - Show error only if prefix is wrong or number is too long
    // - Only fully validate when expected length is reached
    const errPrefix = 'Phone must start with 09 or +2519 (or 2519)'
    const errTooLong = 'Phone number is too long. Expected 8 digits after 09 or 2519'

    if (cleaned.startsWith('09')) {
      if (cleaned.length > 10) return errTooLong
      if (cleaned.length < 10) return undefined
      return /^09\d{8}$/.test(cleaned) ? undefined : 'Invalid phone number. Use 09XXXXXXXX'
    }

    if (cleaned.startsWith('+')) {
      // Allow progressive typing for +, +2, +25, +251
      // Accept full numbers only when they start with +2519
      if (!cleaned.startsWith('+251')) {
        if (!'+251'.startsWith(cleaned)) return errPrefix
        return undefined
      }
      // If user typed +251X... where X is not 9, show error once that digit exists
      if (cleaned.length >= 5 && cleaned[4] !== '9') return errPrefix
      if (!cleaned.startsWith('+2519')) return undefined
      if (cleaned.length > 13) return errTooLong
      if (cleaned.length < 13) return undefined
      return /^\+2519\d{8}$/.test(cleaned) ? undefined : 'Invalid phone number. Use +2519XXXXXXXX'
    }

    if (cleaned.startsWith('251') || '251'.startsWith(cleaned)) {
      // Allow progressive typing for 2, 25, 251
      if (!cleaned.startsWith('251')) return undefined
      if (cleaned.length >= 4 && cleaned[3] !== '9') return errPrefix
      if (!cleaned.startsWith('2519')) return undefined
      if (cleaned.length > 12) return errTooLong
      if (cleaned.length < 12) return undefined
      return /^2519\d{8}$/.test(cleaned) ? undefined : 'Invalid phone number. Use 2519XXXXXXXX'
    }

    // If user is still typing the first digit(s) but it's not clearly wrong, allow until it diverges
    if ('09'.startsWith(cleaned) || '+2519'.startsWith(cleaned) || '2519'.startsWith(cleaned) || '+251'.startsWith(cleaned) || '251'.startsWith(cleaned)) {
      return undefined
    }

    return errPrefix
  }

  const createMutation = useMutation({
    mutationFn: customersService.create,
    onError: (error: unknown) => {
      console.error('Create customer error:', error)
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || t('customerCreate.errorCreating'))
    },
  })

  const updateField = (field: keyof CreateCustomerData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (field === 'email') {
      if (emailTouched) {
        setFieldErrors((prev) => ({ ...prev, email: validateEmail(value) }))
      } else {
        setFieldErrors((prev) => ({ ...prev, email: undefined }))
      }
    }
    if (field === 'phone_primary') {
      setFieldErrors((prev) => ({ ...prev, phone_primary: validatePhone(value) }))
    }
    if (field === 'phone_secondary') {
      setFieldErrors((prev) => ({ ...prev, phone_secondary: validatePhone(value) }))
    }
  }

  const handleEmailBlur = () => {
    setEmailTouched(true)
    setFieldErrors((prev) => ({ ...prev, email: validateEmail(formData.email || '') }))
  }

  const validateBeforeSave = (): boolean => {
    const emailErr = validateEmail(formData.email || '')
    const phonePrimaryErr = validatePhone(formData.phone_primary || '')
    const phoneSecondaryErr = validatePhone(formData.phone_secondary || '')

    setEmailTouched(true)
    setFieldErrors((prev) => ({
      ...prev,
      email: emailErr,
      phone_primary: phonePrimaryErr,
      phone_secondary: phoneSecondaryErr,
    }))

    return !(emailErr || phonePrimaryErr || phoneSecondaryErr)
  }

  // Debounced duplicate check
  const checkDuplicate = useCallback(async (idNumber?: string, licenseNumber?: string, phone?: string) => {
    if (!idNumber && !licenseNumber && !phone) {
      setDuplicateWarning(null)
      return
    }
    
    setCheckingDuplicate(true)
    try {
      const result = await customersService.checkDuplicate({
        id_number: idNumber || undefined,
        license_number: licenseNumber || undefined,
        phone: phone || undefined,
      })
      setDuplicateWarning(result.duplicate ? result : null)
    } catch (error) {
      console.error('Duplicate check error:', error)
    } finally {
      setCheckingDuplicate(false)
    }
  }, [])

  // Check for duplicates when ID number or license changes
  const handleIdNumberBlur = () => {
    if (formData.id_number && formData.id_number.length >= 4) {
      checkDuplicate(formData.id_number, undefined, undefined)
    }
  }

  const handleLicenseBlur = () => {
    if (formData.driver_license_number && formData.driver_license_number.length >= 4) {
      checkDuplicate(undefined, formData.driver_license_number, undefined)
    }
  }

  // Auto-capitalize on blur for name fields
  const handleNameBlur = (field: 'first_name' | 'last_name') => {
    setFormData((prev) => ({ ...prev, [field]: capitalizeWords(prev[field] || '') }))
  }

  // Phone normalization on blur + duplicate check for primary phone
  const handlePhoneBlur = (field: 'phone_primary' | 'phone_secondary') => {
    const normalized = normalizeEthiopianPhone(formData[field] || '')
    setFormData((prev) => ({ ...prev, [field]: normalized }))
    
    // Check for duplicate phone on primary phone
    if (field === 'phone_primary' && normalized && normalized.length >= 9) {
      checkDuplicate(undefined, undefined, normalized)
    }
  }

  // Auto-capitalize city/subcity on blur
  const handleLocationBlur = (field: 'city' | 'wereda') => {
    setFormData((prev) => ({ ...prev, [field]: capitalizeWords(prev[field] || '') }))
  }

  // Check if there's a phone duplicate and show modal, otherwise proceed with save
  const handleSaveAndClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    if (duplicateWarning?.match === 'phone') {
      setPendingSaveAction('close')
      setShowPhoneDuplicateModal(true)
      return
    }
    await performSave('close')
  }

  const handleSaveAndNext = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    if (duplicateWarning?.match === 'phone') {
      setPendingSaveAction('next')
      setShowPhoneDuplicateModal(true)
      return
    }
    await performSave('next')
  }

  const performSave = async (action: 'close' | 'next') => {
    try {
      const customer = await createMutation.mutateAsync(formData)

      // Upload staged documents after customer is created
      const uploads = Object.entries(stagedDocuments) as Array<[DocumentType, File]>
      for (const [docType, file] of uploads) {
        if (!file) continue
        await customerDocumentsService.upload(customer.id, docType, file)
      }

      clearDraft() // Clear draft on successful save
      setStagedDocuments({})
      if (action === 'close') {
        navigate('/customers')
      } else {
        navigate(`/customers/${customer.id}/collaterals/new`)
      }
    } catch {
      // Error handled in mutation
    }
  }

  const handleProceedWithDuplicate = async () => {
    setShowPhoneDuplicateModal(false)
    if (pendingSaveAction) {
      await performSave(pendingSaveAction)
    }
    setPendingSaveAction(null)
  }

  const handleCancelDuplicate = () => {
    setShowPhoneDuplicateModal(false)
    setPendingSaveAction(null)
  }

  const isLoading = createMutation.isPending
  const hasValidationErrors = Boolean(fieldErrors.email || fieldErrors.phone_primary || fieldErrors.phone_secondary)
  const canSave = !isLoading && !hasValidationErrors

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/customers')} className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('customerCreate.title')}</h1>
            <p className="text-sm text-gray-500">{t('customerCreate.step1')}</p>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar - Progress Checklist */}
        <div className="w-64 border-r bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">{t('customerCreate.progress')}</h3>
          <div className="space-y-3">
            <ChecklistItem label={t('customerCreate.personalInfo')} complete={isPersonalComplete} />
            <ChecklistItem label={t('customerCreate.contactInfo')} complete={isContactComplete} />
            {isIndividual && <ChecklistItem label={t('customerCreate.idAndLicense')} complete={isIdComplete} />}
            <ChecklistItem label={t('customerCreate.address')} complete={isAddressComplete} />
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">{t('customerCreate.wizardSteps')}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</div>
                <span className="text-sm font-medium">{t('customerCreate.customer')}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">2</div>
                <span className="text-sm">{t('customerCreate.collateral')}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">3</div>
                <span className="text-sm">{t('customerCreate.agreement')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="flex-1 p-6">
          <form className="mx-auto max-w-3xl space-y-8">
            {/* Draft Recovery Banner */}
            {hasDraft && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="text-sm text-blue-800">
                      <strong>{t('customerCreate.draftRecovered')}</strong> {t('customerCreate.draftRestored')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {t('customerCreate.clearDraft')}
                  </button>
                </div>
              </div>
            )}

            {/* Business Type Section */}
            <Section icon={<Building2 className="h-5 w-5" />} title={t('customerCreate.businessType')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.businessTypeRequired')}</label>
                  <select
                    value={formData.business_type}
                    onChange={(e) => {
                      updateField('business_type', e.target.value)
                      if (e.target.value === 'individual') {
                        updateField('company_name', '')
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="individual">{t('customerCreate.individual')}</option>
                    <option value="company">{t('customerCreate.company')}</option>
                    <option value="government">{t('customerCreate.government')}</option>
                    <option value="embassy">{t('customerCreate.embassy')}</option>
                    <option value="ngo">{t('customerCreate.ngo')}</option>
                    <option value="church">{t('customerCreate.church')}</option>
                  </select>
                </div>
                {!isIndividual && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.companyNameRequired')}</label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => updateField('company_name', e.target.value)}
                      required={!isIndividual}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
                {!isIndividual && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.tinNumber')}</label>
                    <input
                      type="text"
                      value={formData.tin_number}
                      onChange={(e) => updateField('tin_number', e.target.value)}
                      placeholder={t('customerCreate.tinPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* Personal Info Section */}
            <Section icon={<User className="h-5 w-5" />} title={t('customerCreate.personalInformation')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.firstNameRequired')}</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => updateField('first_name', e.target.value)}
                    onBlur={() => handleNameBlur('first_name')}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.lastNameRequired')}</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => updateField('last_name', e.target.value)}
                    onBlur={() => handleNameBlur('last_name')}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </Section>

            {/* Contact Info Section */}
            <Section icon={<Phone className="h-5 w-5" />} title={t('customerCreate.contactInformation')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.primaryPhoneRequired')}</label>
                  <input
                    type="tel"
                    value={formData.phone_primary}
                    onChange={(e) => updateField('phone_primary', e.target.value)}
                    onBlur={() => handlePhoneBlur('phone_primary')}
                    required
                    placeholder={t('customerCreate.phonePlaceholder')}
                    className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${fieldErrors.phone_primary ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                  <p className="mt-1 text-xs text-gray-500">{t('customerCreate.phoneFormatHint')}</p>
                  {fieldErrors.phone_primary && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone_primary}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.secondaryPhone')}</label>
                  <input
                    type="tel"
                    value={formData.phone_secondary}
                    onChange={(e) => updateField('phone_secondary', e.target.value)}
                    onBlur={() => handlePhoneBlur('phone_secondary')}
                    placeholder={t('customerCreate.phonePlaceholder')}
                    className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${fieldErrors.phone_secondary ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                  {fieldErrors.phone_secondary && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone_secondary}</p>}
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    onBlur={handleEmailBlur}
                    placeholder={t('customerCreate.emailPlaceholder')}
                    className={`w-full rounded-lg border py-2 pl-10 pr-3 focus:outline-none focus:ring-1 ${emailTouched && fieldErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                </div>
                {emailTouched && fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
              </div>
            </Section>

            {/* Duplicate Warning Banner */}
            {duplicateWarning && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-yellow-800">{t('customerCreate.possibleDuplicate')}</h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      {t('customerCreate.duplicateExists', { type: duplicateWarning.match === 'id_number' ? t('customerCreate.idAndLicense') : duplicateWarning.match === 'license_number' ? t('customerCreate.idAndLicense') : t('customerCreate.contactInfo') })} <strong>{duplicateWarning.customer_name}</strong>
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open(`/customers`, '_blank')}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                    >
                      {t('customerCreate.viewExisting')} <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ID & License Section - Only for Individual */}
            {isIndividual && (
              <Section icon={<FileText className="h-5 w-5" />} title={t('customerCreate.idAndLicense')}>
                {checkingDuplicate && (
                  <div className="mb-4 text-sm text-gray-500">Checking for duplicates...</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.idTypeRequired')}</label>
                    <select
                      value={formData.id_type}
                      onChange={(e) => updateField('id_type', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="passport">{t('customerCreate.passport')}</option>
                      <option value="national_id">{t('customerCreate.nationalId')}</option>
                      <option value="kebele_id">{t('customerCreate.kebeleId')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.idNumberRequired')}</label>
                    <input
                      type="text"
                      value={formData.id_number}
                      onChange={(e) => updateField('id_number', e.target.value)}
                      onBlur={handleIdNumberBlur}
                      required={isIndividual}
                      className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${duplicateWarning?.match === 'id_number' ? 'border-yellow-400 focus:border-yellow-500 focus:ring-yellow-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.driverLicenseRequired')}</label>
                  <input
                    type="text"
                    value={formData.driver_license_number}
                    onChange={(e) => updateField('driver_license_number', e.target.value)}
                    onBlur={handleLicenseBlur}
                    required={isIndividual}
                    className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${duplicateWarning?.match === 'license_number' ? 'border-yellow-400 focus:border-yellow-500 focus:ring-yellow-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                </div>
              </Section>
            )}

            {/* Document Upload Section - Only for Individual */}
            {isIndividual && (
              <Section icon={<Upload className="h-5 w-5" />} title={t('customerCreate.documentUploads')}>
                <p className="mb-4 text-sm text-gray-500">
                  {t('customerCreate.uploadHint')}
                </p>
                <div className="grid grid-cols-2 gap-6">
                  {/* ID Document based on selected type */}
                  <DocumentDropzone
                    customerId={null}
                    docType={formData.id_type as DocumentType}
                    label={`${formData.id_type === 'passport' ? 'Passport' : formData.id_type === 'national_id' ? 'National ID' : 'Kebele ID'} Document`}
                    disabled={false}
                    onFileSelected={(file) =>
                      setStagedDocuments((prev) => {
                        const key = formData.id_type as DocumentType
                        if (!file) {
                          const next = { ...prev }
                          delete next[key]
                          return next
                        }
                        return { ...prev, [key]: file }
                      })
                    }
                  />
                  
                  {/* Driver License */}
                  <DocumentDropzone
                    customerId={null}
                    docType="driver_license"
                    label="Driver License"
                    disabled={false}
                    onFileSelected={(file) =>
                      setStagedDocuments((prev) => {
                        if (!file) {
                          const next = { ...prev }
                          delete next.driver_license
                          return next
                        }
                        return { ...prev, driver_license: file }
                      })
                    }
                  />
                </div>
              </Section>
            )}

            {/* Address Section */}
            <Section icon={<MapPin className="h-5 w-5" />} title={t('customerCreate.address')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.houseNumber')}</label>
                  <input
                    type="text"
                    value={formData.house_number}
                    onChange={(e) => updateField('house_number', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.wereda')}</label>
                  <input
                    type="text"
                    value={formData.wereda}
                    onChange={(e) => updateField('wereda', e.target.value)}
                    onBlur={() => handleLocationBlur('wereda')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.subcity')}</label>
                  <select
                    value={formData.subcity}
                    onChange={(e) => updateField('subcity', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">{t('customerCreate.selectSubcity')}</option>
                    {SUBCITIES.map((sc) => (
                      <option key={sc} value={sc}>{sc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('customerCreate.city')}</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    onBlur={() => handleLocationBlur('city')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </Section>

            {/* Notes Section */}
            <Section icon={<FileText className="h-5 w-5" />} title={t('customerCreate.additionalNotes')}>
              <textarea
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
                placeholder={t('customerCreate.notesPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Section>

            {/* Action Buttons */}
            <div className="flex items-center justify-between border-t pt-6">
              <button
                type="button"
                onClick={() => navigate('/customers')}
                className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={!canSave}
                  className="rounded-lg border border-blue-600 px-6 py-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {isLoading ? t('customerCreate.saving') : t('customerCreate.saveAndClose')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={!canSave}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? t('customerCreate.saving') : t('customerCreate.saveAndNext')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Phone Duplicate Confirmation Modal */}
      {showPhoneDuplicateModal && duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{t('customerCreate.duplicatePhone')}</h3>
                <p className="mt-2 text-sm text-gray-600">
                  {t('customerCreate.duplicatePhoneDesc')} <strong>{duplicateWarning.customer_name}</strong>
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  {t('customerCreate.proceedDuplicate')}
                </p>
              </div>
              <button onClick={handleCancelDuplicate} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleCancelDuplicate}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleProceedWithDuplicate}
                disabled={isLoading}
                className="rounded-lg bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-50"
              >
                {isLoading ? t('customerCreate.saving') : t('customerCreate.proceedAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-gray-700">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ChecklistItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full ${complete ? 'bg-green-500' : 'bg-gray-200'}`}>
        {complete && <CheckCircle className="h-4 w-4 text-white" />}
      </div>
      <span className={`text-sm ${complete ? 'text-green-700' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}
