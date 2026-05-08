import apiClient from './apiClient'

export type DocumentType = 'passport' | 'national_id' | 'kebele_id' | 'driver_license'

export interface CollateralDocument {
  id: number
  collateral_id: number
  doc_type: DocumentType
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

export interface CollateralDocumentListResponse {
  items: CollateralDocument[]
  total: number
}

export const collateralDocumentsService = {
  async list(collateralId: number): Promise<CollateralDocumentListResponse> {
    return apiClient.get(`/collaterals/${collateralId}/documents`)
  },

  async upload(collateralId: number, docType: DocumentType, file: File): Promise<CollateralDocument> {
    const formData = new FormData()
    formData.append('doc_type', docType)
    formData.append('file', file)

    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/collaterals/${collateralId}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || 'Upload failed')
    }

    return response.json()
  },

  async delete(collateralId: number, documentId: number): Promise<void> {
    return apiClient.delete(`/collaterals/${collateralId}/documents/${documentId}`)
  },
}

export default collateralDocumentsService
