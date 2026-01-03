import apiClient from './apiClient'

export type DocumentType = 'passport' | 'national_id' | 'kebele_id' | 'driver_license'

export interface CustomerDocument {
  id: number
  customer_id: number
  doc_type: DocumentType
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

export interface CustomerDocumentListResponse {
  items: CustomerDocument[]
  total: number
}

export const customerDocumentsService = {
  async list(customerId: number): Promise<CustomerDocumentListResponse> {
    return apiClient.get(`/customers/${customerId}/documents`)
  },

  async upload(customerId: number, docType: DocumentType, file: File): Promise<CustomerDocument> {
    const formData = new FormData()
    formData.append('doc_type', docType)
    formData.append('file', file)
    
    // Use fetch directly for multipart/form-data
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/customers/${customerId}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || 'Upload failed')
    }
    
    return response.json()
  },

  async delete(customerId: number, documentId: number): Promise<void> {
    return apiClient.delete(`/customers/${customerId}/documents/${documentId}`)
  },
}

export default customerDocumentsService
