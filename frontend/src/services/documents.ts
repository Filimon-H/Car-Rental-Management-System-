import apiClient from './apiClient'

export interface GeneratedDocument {
  filename: string
  download_url: string
  agreement_id?: number | null
  inspection_id?: number | null
  payment_id?: number | null
  generated_at: string
}

/**
 * Triggers a browser download for a generated document.
 *
 * The file is fetched as a blob through apiClient so the request carries the
 * auth header — a plain link to the download URL would be unauthenticated.
 */
async function download(filename: string) {
  const blob = await apiClient.getBlob(`/documents/download/${filename}`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const documentsService = {
  /** Generate a receipt for one payment, then download it. */
  async generateReceipt(agreementId: number, paymentId?: number): Promise<GeneratedDocument> {
    const query = paymentId ? `?payment_id=${paymentId}` : ''
    const result = await apiClient.post<GeneratedDocument>(
      `/documents/agreements/${agreementId}/receipt${query}`
    )
    await download(result.filename)
    return result
  },

  async generateInspectionReport(inspectionId: number): Promise<GeneratedDocument> {
    const result = await apiClient.post<GeneratedDocument>(
      `/documents/inspections/${inspectionId}/report`
    )
    await download(result.filename)
    return result
  },
}

export default documentsService
