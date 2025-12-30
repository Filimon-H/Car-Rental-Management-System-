import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Printer, FileText, Download, Receipt, ClipboardList, Loader2 } from 'lucide-react'
import apiClient from '@/services/apiClient'

type DocumentType = 'agreement' | 'receipt' | 'inspection'

interface PrintButtonProps {
  documentType: DocumentType
  agreementId?: number
  inspectionId?: number
  paymentId?: number
  variant?: 'button' | 'icon' | 'menu-item'
  className?: string
}

interface GeneratedDocument {
  filename: string
  filepath: string
  agreement_id?: number
  inspection_id?: number
  payment_id?: number
  generated_at: string
}

export default function PrintButton({
  documentType,
  agreementId,
  inspectionId,
  paymentId,
  variant = 'button',
  className = '',
}: PrintButtonProps) {
  const generateAgreementMutation = useMutation({
    mutationFn: () => apiClient.post<GeneratedDocument>(`/documents/agreements/${agreementId}/generate`),
    onSuccess: (data) => handleDownload(data.filename),
  })

  const generateReceiptMutation = useMutation({
    mutationFn: () => apiClient.post<GeneratedDocument>(`/documents/agreements/${agreementId}/receipt`, { payment_id: paymentId }),
    onSuccess: (data) => handleDownload(data.filename),
  })

  const generateInspectionMutation = useMutation({
    mutationFn: () => apiClient.post<GeneratedDocument>(`/documents/inspections/${inspectionId}/report`),
    onSuccess: (data) => handleDownload(data.filename),
  })

  const handleDownload = async (filename: string) => {
    try {
      const response = await fetch(`/api/documents/download/${filename}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const handleGenerate = () => {
    switch (documentType) {
      case 'agreement':
        generateAgreementMutation.mutate()
        break
      case 'receipt':
        generateReceiptMutation.mutate()
        break
      case 'inspection':
        generateInspectionMutation.mutate()
        break
    }
  }

  const isLoading =
    generateAgreementMutation.isPending ||
    generateReceiptMutation.isPending ||
    generateInspectionMutation.isPending

  const getIcon = () => {
    switch (documentType) {
      case 'agreement':
        return <FileText className="h-4 w-4" />
      case 'receipt':
        return <Receipt className="h-4 w-4" />
      case 'inspection':
        return <ClipboardList className="h-4 w-4" />
      default:
        return <Printer className="h-4 w-4" />
    }
  }

  const getLabel = () => {
    switch (documentType) {
      case 'agreement':
        return 'Print Agreement'
      case 'receipt':
        return 'Print Receipt'
      case 'inspection':
        return 'Print Inspection'
      default:
        return 'Print'
    }
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className={`rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 ${className}`}
        title={getLabel()}
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
      </button>
    )
  }

  if (variant === 'menu-item') {
    return (
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50 ${className}`}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : getIcon()}
        {getLabel()}
      </button>
    )
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={isLoading}
      className={`flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${className}`}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : getIcon()}
      {getLabel()}
    </button>
  )
}

// Dropdown menu with multiple print options
interface PrintMenuProps {
  agreementId: number
  className?: string
}

export function PrintMenu({ agreementId, className = '' }: PrintMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Printer className="h-4 w-4" />
        Print
        <Download className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
            <PrintButton
              documentType="agreement"
              agreementId={agreementId}
              variant="menu-item"
            />
            <PrintButton
              documentType="receipt"
              agreementId={agreementId}
              variant="menu-item"
            />
          </div>
        </>
      )}
    </div>
  )
}
