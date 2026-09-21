import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { vendorsService, CreateVendorData } from '@/services/vendors'
import { getErrorMessage, getFieldErrors } from '@/services/apiClient'
import { Field, SelectField, TextareaField } from '@/components/ui/Field'

export default function VendorUpsertPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { vendorId } = useParams<{ vendorId: string }>()
  const vendorIdNum = vendorId ? parseInt(vendorId, 10) : null
  const isEdit = !!vendorIdNum

  const { data: vendor, isLoading: loadingVendor } = useQuery({
    queryKey: ['vendor', vendorIdNum],
    queryFn: () => vendorsService.getById(vendorIdNum as number),
    enabled: !!vendorIdNum,
  })

  const [formData, setFormData] = useState<CreateVendorData>({
    vendor_type: 'company',
    company_name: '',
    contact_person: '',
    phone_primary: '',
    phone_secondary: '',
    email: '',
    address: '',
    city: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_holder: '',
    commission_rate: '70',
    notes: '',
  })

  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!vendor) return

    setFormData({
      vendor_type: vendor.vendor_type || 'company',
      company_name: vendor.company_name || '',
      contact_person: vendor.contact_person || '',
      phone_primary: vendor.phone_primary || '',
      phone_secondary: vendor.phone_secondary || '',
      email: vendor.email || '',
      address: vendor.address || '',
      city: vendor.city || '',
      bank_name: vendor.bank_name || '',
      bank_account_number: vendor.bank_account_number || '',
      bank_account_holder: vendor.bank_account_holder || '',
      commission_rate: vendor.commission_rate ?? '',
      notes: vendor.notes || '',
    })
  }, [vendor])

  const createMutation = useMutation({
    mutationFn: vendorsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      navigate('/vendors')
    },
    onError: (error: unknown) => {
      setFieldErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error, 'Error creating vendor'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateVendorData>) => vendorsService.update(vendorIdNum as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorIdNum] })
      navigate('/vendors')
    },
    onError: (error: unknown) => {
      setFieldErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error, 'Error updating vendor'))
    },
  })

  const isLoading = createMutation.isPending || updateMutation.isPending || loadingVendor
  const isCompany = formData.vendor_type === 'company'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    setFormError(null)
    setFieldErrors({})

    // mutate (not mutateAsync) — onError already surfaces the failure, and an
    // unawaited rejection here would surface again as an unhandled rejection.
    if (isEdit) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }



  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/vendors')} className="rounded-lg p-2 hover:bg-gray-100" title={t('common.back')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Vendor' : 'Add Vendor'}</h1>
            <p className="text-sm text-gray-500">Vendor details and contact information</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-6">
            {formError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <SelectField
                  label="Type"
                  value={formData.vendor_type}
                  onChange={e => setFormData({...formData, vendor_type: e.target.value})}
                  error={fieldErrors.vendor_type}
                >
                  <option value="company">Company</option>
                  <option value="individual">Individual</option>
                </SelectField>
              </div>

              {isCompany && (
                <div>
                  <Field
                  label="Company Name"
                  required
                  type="text"
                  value={formData.company_name}
                  onChange={e => setFormData({...formData, company_name: e.target.value})}
                  error={fieldErrors.company_name}
                />
                </div>
              )}

              <div className={!isCompany ? 'col-span-1' : 'col-span-2'}>
                <Field
                  label="Contact Person"
                  type="text"
                  value={formData.contact_person}
                  onChange={e => setFormData({...formData, contact_person: e.target.value})}
                  error={fieldErrors.contact_person}
                />
              </div>

              <div>
                <Field
                  label="Primary Phone"
                  required
                  type="tel"
                  value={formData.phone_primary}
                  onChange={e => setFormData({...formData, phone_primary: e.target.value})}
                  error={fieldErrors.phone_primary}
                />
              </div>

              <div>
                <Field
                  label="Secondary Phone"
                  type="tel"
                  value={formData.phone_secondary}
                  onChange={e => setFormData({...formData, phone_secondary: e.target.value})}
                  error={fieldErrors.phone_secondary}
                />
              </div>

              <div>
                <Field
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  error={fieldErrors.email}
                />
              </div>

              <div>
                <Field
                  label="City"
                  type="text"
                  value={formData.city}
                  onChange={e => setFormData({...formData, city: e.target.value})}
                  error={fieldErrors.city}
                />
              </div>

              <div className="col-span-2">
                <Field
                  label="Address"
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  error={fieldErrors.address}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">Commission</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Field
                    label="Commission Rate (%)"
                    required
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={formData.commission_rate ?? ''}
                    onChange={e => setFormData({...formData, commission_rate: e.target.value})}
                    error={fieldErrors.commission_rate}
                    hint="Share of rental revenue paid to this vendor. Defaults to 70%."
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">Bank Information</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Field
                  label="Bank Name"
                  type="text"
                  value={formData.bank_name}
                  onChange={e => setFormData({...formData, bank_name: e.target.value})}
                  error={fieldErrors.bank_name}
                />
                </div>
                <div>
                  <Field
                  label="Account Number"
                  type="text"
                  value={formData.bank_account_number}
                  onChange={e => setFormData({...formData, bank_account_number: e.target.value})}
                  error={fieldErrors.bank_account_number}
                />
                </div>
                <div className="col-span-2">
                  <Field
                  label="Account Holder"
                  type="text"
                  value={formData.bank_account_holder}
                  onChange={e => setFormData({...formData, bank_account_holder: e.target.value})}
                  error={fieldErrors.bank_account_holder}
                />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <div>
                <TextareaField
                  label="Notes"
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  error={fieldErrors.notes}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-6">
              <button 
                type="button" 
                onClick={() => navigate('/vendors')} 
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isLoading} 
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Saving…' : 'Save Vendor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
