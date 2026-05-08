import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Briefcase, CheckCircle, Upload } from 'lucide-react'
import { collateralsService, CreateCollateralData } from '@/services/collaterals'
import { customersService } from '@/services/customers'
import { DocumentDropzone } from '@/components/documents/DocumentDropzone'
import { DocumentType } from '@/services/customerDocuments'
import { collateralDocumentsService } from '@/services/collateralDocuments'

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

const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'friend', label: 'Friend' },
  { value: 'employer', label: 'Employer' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'other', label: 'Other' },
]

export default function CollateralCreatePage() {
  const navigate = useNavigate()
  const { customerId } = useParams<{ customerId: string }>()
  const customerIdNum = parseInt(customerId || '0', 10)

  // Fetch customer info
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', customerIdNum],
    queryFn: () => customersService.getById(customerIdNum),
    enabled: !!customerIdNum,
  })

  const [formData, setFormData] = useState<CreateCollateralData>({
    customer_id: customerIdNum,
    first_name: '',
    last_name: '',
    phone_primary: '',
    phone_secondary: '',
    email: '',
    relationship_to_customer: '',
    id_type: 'national_id',
    id_number: '',
    house_number: '',
    wereda: '',
    subcity: '',
    city: 'Addis Ababa',
    occupation: '',
    employer_name: '',
    employer_phone: '',
    notes: '',
  })

  // Track which sections are complete for the checklist
  const isPersonalComplete = !!(formData.first_name && formData.last_name)
  const isContactComplete = !!formData.phone_primary
  const isIdComplete = !!(formData.id_type && formData.id_number)
  const isRelationshipComplete = !!formData.relationship_to_customer

  const createMutation = useMutation({
    mutationFn: collateralsService.create,
    onSuccess: (data) => {
      // queryClient.invalidateQueries({ queryKey: ['collaterals'] })
      navigate(`/customers/${data.customer_id}/agreements/new`)
    },
    onError: (error: unknown) => {
      console.error('Create collateral error:', error)
      const err = error as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail || 'Failed to create collateral')
    },
  })

  // Staged documents (Create page has no collateralId yet)
  const [stagedDocuments, setStagedDocuments] = useState<Partial<Record<DocumentType, File>>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)

  const updateField = (field: keyof CreateCollateralData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

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

  const updateFieldWithValidation = (field: keyof CreateCollateralData, value: string | number) => {
    updateField(field, value)
    if (typeof value !== 'string') return
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

  // Auto-capitalize on blur for name fields
  const handleNameBlur = (field: 'first_name' | 'last_name') => {
    setFormData((prev) => ({ ...prev, [field]: capitalizeWords(prev[field] || '') }))
  }

  // Phone normalization on blur
  const handlePhoneBlur = (field: 'phone_primary' | 'phone_secondary' | 'employer_phone') => {
    setFormData((prev) => ({ ...prev, [field]: normalizeEthiopianPhone(prev[field] || '') }))
  }

  const handleSaveAndClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    try {
      const collateral = await createMutation.mutateAsync({ ...formData, customer_id: customerIdNum })

      setUploadError(null)
      try {
        const uploads = Object.entries(stagedDocuments) as Array<[DocumentType, File]>
        for (const [docType, file] of uploads) {
          if (!file) continue
          await collateralDocumentsService.upload(collateral.id, docType, file)
        }
        setStagedDocuments({})
      } catch (err: unknown) {
        const error = err as Error
        setUploadError(error?.message || 'Document upload failed')
      }

      navigate(`/customers/${customerIdNum}/collaterals/${collateral.id}`)
    } catch {
      // Error handled in mutation
    }
  }

  const handleSaveAndNext = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSave()) return
    try {
      const collateral = await createMutation.mutateAsync({ ...formData, customer_id: customerIdNum })

      setUploadError(null)
      try {
        const uploads = Object.entries(stagedDocuments) as Array<[DocumentType, File]>
        for (const [docType, file] of uploads) {
          if (!file) continue
          await collateralDocumentsService.upload(collateral.id, docType, file)
        }
        setStagedDocuments({})
      } catch (err: unknown) {
        const error = err as Error
        setUploadError(error?.message || 'Document upload failed')
      }

      // Navigate to agreement create page with customer ID prefilled
      navigate(`/agreements/new?customer_id=${customerIdNum}`)
    } catch {
      // Error handled in mutation
    }
  }

  const isLoading = createMutation.isPending
  const hasValidationErrors = Boolean(fieldErrors.email || fieldErrors.phone_primary || fieldErrors.phone_secondary)
  const canSave = !isLoading && !hasValidationErrors

  if (loadingCustomer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
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
          <button onClick={() => navigate(`/customers/${customerIdNum}/edit`)} className="rounded-lg p-2 hover:bg-gray-100" title="Back to Customer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Add Collateral Person</h1>
            <p className="text-sm text-gray-500">Step 2 of 3: Collateral Information</p>
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
            <ChecklistItem label="ID Info" complete={isIdComplete} />
            <ChecklistItem label="Relationship" complete={isRelationshipComplete} />
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">Wizard Steps</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">1</div>
                <span className="text-sm">Customer</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">2</div>
                <span className="text-sm font-medium">Collateral</span>
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
            {uploadError && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
                {uploadError}
              </div>
            )}
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
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Relationship to Customer *</label>
                <select
                  value={formData.relationship_to_customer}
                  onChange={(e) => updateField('relationship_to_customer', e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select relationship...</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
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
                    onChange={(e) => updateFieldWithValidation('phone_primary', e.target.value)}
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
                    onChange={(e) => updateFieldWithValidation('phone_secondary', e.target.value)}
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
                    onChange={(e) => updateFieldWithValidation('email', e.target.value)}
                    onBlur={handleEmailBlur}
                    placeholder="collateral@example.com"
                    className={`w-full rounded-lg border py-2 pl-10 pr-3 focus:outline-none focus:ring-1 ${emailTouched && fieldErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                </div>
                {emailTouched && fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
              </div>
            </Section>

            {/* ID Section */}
            <Section icon={<FileText className="h-5 w-5" />} title="Identification">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">ID Type *</label>
                  <select
                    value={formData.id_type}
                    onChange={(e) => updateField('id_type', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="kebele_id">Kebele ID</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">ID Number *</label>
                  <input
                    type="text"
                    value={formData.id_number}
                    onChange={(e) => updateField('id_number', e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </Section>

            {/* Employment Section */}
            <Section icon={<Briefcase className="h-5 w-5" />} title="Employment (Optional)">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Occupation</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => updateField('occupation', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Employer Name</label>
                  <input
                    type="text"
                    value={formData.employer_name}
                    onChange={(e) => updateField('employer_name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Employer Phone</label>
                <input
                  type="tel"
                  value={formData.employer_phone}
                  onChange={(e) => updateField('employer_phone', e.target.value)}
                  onBlur={() => handlePhoneBlur('employer_phone')}
                  placeholder="09XXXXXXXX or +251..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </Section>

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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </Section>

            {/* Document Upload Section */}
            <Section icon={<Upload className="h-5 w-5" />} title="Document Uploads">
              <p className="mb-4 text-sm text-gray-500">
                Upload photos or scans of collateral person's ID documents. Documents will be saved after collateral is created.
              </p>
              <div className="grid grid-cols-2 gap-6">
                {/* ID Document based on selected type */}
                <DocumentDropzone
                  ownerType="collateral"
                  collateralId={null}
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
              </div>
            </Section>

            {/* Notes Section */}
            <Section icon={<FileText className="h-5 w-5" />} title="Additional Notes">
              <textarea
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes about this collateral person..."
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
