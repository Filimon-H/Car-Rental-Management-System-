import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Building2, CheckCircle, AlertTriangle, ExternalLink, Upload, Loader2 } from 'lucide-react'
import { customersService, CreateCustomerData, DuplicateCheckResult } from '@/services/customers'
import { customerDocumentsService, CustomerDocument, DocumentType } from '@/services/customerDocuments'
import { DocumentDropzone } from '@/components/documents/DocumentDropzone'

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

export default function CustomerEditPage() {
  const navigate = useNavigate()
  const { customerId } = useParams<{ customerId: string }>()
  const customerIdNum = parseInt(customerId || '0', 10)
  const queryClient = useQueryClient()

  // Fetch customer data
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', customerIdNum],
    queryFn: () => customersService.getById(customerIdNum),
    enabled: !!customerIdNum,
  })

  // Fetch existing documents
  const { data: documentsData, isLoading: loadingDocuments } = useQuery({
    queryKey: ['customer-documents', customerIdNum],
    queryFn: () => customerDocumentsService.list(customerIdNum),
    enabled: !!customerIdNum,
  })

  const [formData, setFormData] = useState<CreateCustomerData>({
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
  })

  // Update form when customer data loads
  useEffect(() => {
    if (customer) {
      setFormData({
        business_type: customer.business_type || 'individual',
        company_name: customer.company_name || '',
        tin_number: customer.tin_number || '',
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        phone_primary: customer.phone_primary || '',
        phone_secondary: customer.phone_secondary || '',
        email: customer.email || '',
        id_type: customer.id_type || 'passport',
        id_number: customer.id_number || '',
        driver_license_number: customer.driver_license_number || '',
        house_number: customer.house_number || '',
        wereda: customer.wereda || '',
        subcity: customer.subcity || '',
        city: customer.city || 'Addis Ababa',
        notes: customer.notes || '',
      })
    }
  }, [customer])

  const isIndividual = formData.business_type === 'individual'

  // Track which sections are complete for the checklist
  const isPersonalComplete = !!(formData.first_name && formData.last_name)
  const isContactComplete = !!formData.phone_primary
  const isIdComplete = isIndividual ? !!(formData.id_type && formData.id_number && formData.driver_license_number) : true
  const isAddressComplete = !!formData.city

  // Duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)

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
      if (cleaned.length >= 5 && cleaned[4] !== '9') return errPrefix
      if (!cleaned.startsWith('+2519')) return undefined
      if (cleaned.length > 13) return errTooLong
      if (cleaned.length < 13) return undefined
      return /^\+2519\d{8}$/.test(cleaned) ? undefined : 'Invalid phone number. Use +2519XXXXXXXX'
    }

    if (cleaned.startsWith('251') || '251'.startsWith(cleaned)) {
      if (!cleaned.startsWith('251')) return undefined
      if (cleaned.length >= 4 && cleaned[3] !== '9') return errPrefix
      if (!cleaned.startsWith('2519')) return undefined
      if (cleaned.length > 12) return errTooLong
      if (cleaned.length < 12) return undefined
      return /^2519\d{8}$/.test(cleaned) ? undefined : 'Invalid phone number. Use 2519XXXXXXXX'
    }

    if ('09'.startsWith(cleaned) || '+2519'.startsWith(cleaned) || '2519'.startsWith(cleaned) || '+251'.startsWith(cleaned) || '251'.startsWith(cleaned)) {
      return undefined
    }

    return errPrefix
  }

  const updateMutation = useMutation({
    mutationFn: (data: CreateCustomerData) => customersService.update(customerIdNum, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer', customerIdNum] })
    },
    onError: (error: unknown) => {
      console.error('Update customer error:', error)
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || 'Failed to update customer')
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
        exclude_id: customerIdNum, // Exclude current customer from duplicate check
      })
      setDuplicateWarning(result.duplicate ? result : null)
    } catch (error) {
      console.error('Duplicate check error:', error)
    } finally {
      setCheckingDuplicate(false)
    }
  }, [customerIdNum])

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

  // Phone normalization on blur
  const handlePhoneBlur = (field: 'phone_primary' | 'phone_secondary') => {
    setFormData((prev) => ({ ...prev, [field]: normalizeEthiopianPhone(prev[field] || '') }))
  }

  // Auto-capitalize city/subcity on blur
  const handleLocationBlur = (field: 'city' | 'wereda') => {
    setFormData((prev) => ({ ...prev, [field]: capitalizeWords(prev[field] || '') }))
  }

  const handleSaveAndClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    try {
      await updateMutation.mutateAsync(formData)
      navigate('/customers')
    } catch {
      // Error handled in mutation
    }
  }

  const handleSaveAndNext = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    try {
      await updateMutation.mutateAsync(formData)
      // Navigate to collateral create/edit page with customer ID
      navigate(`/customers/${customerIdNum}/collaterals/new`)
    } catch {
      // Error handled in mutation
    }
  }

  const isLoading = updateMutation.isPending
  const hasValidationErrors = Boolean(fieldErrors.email || fieldErrors.phone_primary || fieldErrors.phone_secondary)
  const canSave = !isLoading && !hasValidationErrors

  // Get existing documents by type
  const getDocumentByType = (docType: DocumentType): CustomerDocument | undefined => {
    return documentsData?.items.find(doc => doc.doc_type === docType)
  }

  if (loadingCustomer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <p className="text-lg text-gray-600">Customer not found</p>
        <button onClick={() => navigate('/customers')} className="mt-4 text-blue-600 hover:underline">
          Back to Customers
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/customers')} className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Customer</h1>
            <p className="text-sm text-gray-500">{customer.full_name}</p>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar - Progress Checklist */}
        <div className="w-64 border-r bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">Progress</h3>
          <div className="space-y-3">
            <ChecklistItem label="Personal Info" complete={isPersonalComplete} />
            <ChecklistItem label="Contact Info" complete={isContactComplete} />
            {isIndividual && <ChecklistItem label="ID & License" complete={isIdComplete} />}
            <ChecklistItem label="Address" complete={isAddressComplete} />
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">Wizard Steps</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</div>
                <span className="text-sm font-medium">Customer</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">2</div>
                <span className="text-sm">Collateral</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">3</div>
                <span className="text-sm">Agreement</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="flex-1 p-6">
          <form className="mx-auto max-w-3xl space-y-8">
            {/* Business Type Section */}
            <Section icon={<Building2 className="h-5 w-5" />} title="Business Type">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Business Type *</label>
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
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                    <option value="government">Government</option>
                    <option value="embassy">Embassy</option>
                    <option value="ngo">NGO</option>
                    <option value="church">Church</option>
                  </select>
                </div>
                {!isIndividual && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Company/Organization Name *</label>
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
                    <label className="mb-1 block text-sm font-medium text-gray-700">TIN Number</label>
                    <input
                      type="text"
                      value={formData.tin_number}
                      onChange={(e) => updateField('tin_number', e.target.value)}
                      placeholder="Tax Identification Number"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* Personal Info Section */}
            <Section icon={<User className="h-5 w-5" />} title="Personal Information">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">First Name *</label>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Last Name *</label>
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
            <Section icon={<Phone className="h-5 w-5" />} title="Contact Information">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Primary Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone_primary}
                    onChange={(e) => updateField('phone_primary', e.target.value)}
                    onBlur={() => handlePhoneBlur('phone_primary')}
                    required
                    placeholder="09XXXXXXXX or +251..."
                    className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${fieldErrors.phone_primary ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                  <p className="mt-1 text-xs text-gray-500">Will auto-format to +251 format</p>
                  {fieldErrors.phone_primary && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone_primary}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Secondary Phone</label>
                  <input
                    type="tel"
                    value={formData.phone_secondary}
                    onChange={(e) => updateField('phone_secondary', e.target.value)}
                    onBlur={() => handlePhoneBlur('phone_secondary')}
                    placeholder="09XXXXXXXX or +251..."
                    className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${fieldErrors.phone_secondary ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                  {fieldErrors.phone_secondary && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone_secondary}</p>}
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    onBlur={handleEmailBlur}
                    placeholder="customer@example.com"
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
                    <h3 className="font-medium text-yellow-800">Possible Duplicate Customer</h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      A customer with this {duplicateWarning.match === 'id_number' ? 'ID number' : duplicateWarning.match === 'license_number' ? 'license number' : 'phone number'} already exists: <strong>{duplicateWarning.customer_name}</strong>
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open(`/customers`, '_blank')}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                    >
                      View existing customers <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ID & License Section - Only for Individual */}
            {isIndividual && (
              <Section icon={<FileText className="h-5 w-5" />} title="ID & License">
                {checkingDuplicate && (
                  <div className="mb-4 text-sm text-gray-500">Checking for duplicates...</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">ID Type *</label>
                    <select
                      value={formData.id_type}
                      onChange={(e) => updateField('id_type', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="passport">Passport</option>
                      <option value="national_id">National ID</option>
                      <option value="kebele_id">Kebele ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">ID Number *</label>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Driver License Number *</label>
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
              <Section icon={<Upload className="h-5 w-5" />} title="Document Uploads">
                <p className="mb-4 text-sm text-gray-500">
                  Upload or replace photos/scans of ID documents.
                </p>
                {loadingDocuments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {/* ID Document based on selected type */}
                    <DocumentDropzone
                      customerId={customerIdNum}
                      docType={formData.id_type as DocumentType}
                      label={`${formData.id_type === 'passport' ? 'Passport' : formData.id_type === 'national_id' ? 'National ID' : 'Kebele ID'} Document`}
                      existingDocument={getDocumentByType(formData.id_type as DocumentType)}
                      onUploadComplete={() => queryClient.invalidateQueries({ queryKey: ['customer-documents', customerIdNum] })}
                    />
                    
                    {/* Driver License */}
                    <DocumentDropzone
                      customerId={customerIdNum}
                      docType="driver_license"
                      label="Driver License"
                      existingDocument={getDocumentByType('driver_license')}
                      onUploadComplete={() => queryClient.invalidateQueries({ queryKey: ['customer-documents', customerIdNum] })}
                    />
                  </div>
                )}
              </Section>
            )}

            {/* Address Section */}
            <Section icon={<MapPin className="h-5 w-5" />} title="Address">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">House Number</label>
                  <input
                    type="text"
                    value={formData.house_number}
                    onChange={(e) => updateField('house_number', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Wereda</label>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Subcity</label>
                  <select
                    value={formData.subcity}
                    onChange={(e) => updateField('subcity', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select Subcity</option>
                    {SUBCITIES.map((sc) => (
                      <option key={sc} value={sc}>{sc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
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
            <Section icon={<FileText className="h-5 w-5" />} title="Additional Notes">
              <textarea
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes about this customer..."
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
                Cancel
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={!canSave}
                  className="rounded-lg border border-blue-600 px-6 py-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save & Close'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={!canSave}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save & Next →'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
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
