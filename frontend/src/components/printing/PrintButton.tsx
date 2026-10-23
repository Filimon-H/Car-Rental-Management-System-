import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Printer, FileText, Download, Receipt, ClipboardList, Loader2 } from 'lucide-react'
import apiClient, { getErrorMessage } from '@/services/apiClient'

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
  /*
    Failures used to go to console.error only, so when generation 500'd —
    which every agreement did, on a missing field — staff clicked Print and
    nothing happened, with no message to report.
  */
  const [error, setError] = useState('')

  const fail = (err: unknown, win: Window | null) => {
    win?.close()
    setError(getErrorMessage(err, 'Could not prepare the document'))
  }

  const generateAgreementMutation = useMutation({
    mutationFn: (_win: Window | null) =>
      apiClient.post<GeneratedDocument>(`/documents/agreements/${agreementId}/generate`),
    onSuccess: (data, win) => openDocument(data.filename, win),
    onError: (err, win) => fail(err, win),
  })

  const generateReceiptMutation = useMutation({
    mutationFn: (_win: Window | null) =>
      apiClient.post<GeneratedDocument>(`/documents/agreements/${agreementId}/receipt`, { payment_id: paymentId }),
    onSuccess: (data, win) => openDocument(data.filename, win),
    onError: (err, win) => fail(err, win),
  })

  const generateInspectionMutation = useMutation({
    mutationFn: (_win: Window | null) =>
      apiClient.post<GeneratedDocument>(`/documents/inspections/${inspectionId}/report`),
    onSuccess: (data, win) => openDocument(data.filename, win),
    onError: (err, win) => fail(err, win),
  })

  /**
   * Show the printable document in the tab opened at click time.
   *
   * Documents are HTML now, meant to be printed or saved as PDF, so they
   * open rather than download. The tab has to be opened synchronously in
   * the click handler: one opened after the network round-trip is no
   * longer tied to a user gesture and popup blockers stop it. If the tab
   * was blocked anyway, fall back to a download so nothing is lost.
   */
  const openDocument = async (filename: string, win: Window | null) => {
    try {
      const response = await fetch(`/api/documents/download/${encodeURIComponent(filename)}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
      })
      if (!response.ok) {
        fail(new Error(`Download failed (${response.status})`), win)
        return
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      if (win && !win.closed) {
        win.location.href = url
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      // Give the tab time to load the blob before it is released.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      fail(err, win)
    }
  }

  const handleGenerate = () => {
    setError('')
    const win = window.open('', '_blank')
    switch (documentType) {
      case 'agreement':
        generateAgreementMutation.mutate(win)
        break
      case 'receipt':
        generateReceiptMutation.mutate(win)
        break
      case 'inspection':
        generateInspectionMutation.mutate(win)
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
        title={error || getLabel()}
        aria-label={error ? `${getLabel()}: ${error}` : getLabel()}
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
        <span>
          {getLabel()}
          {error && <span role="alert" className="block text-xs text-red-600">{error}</span>}
        </span>
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
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
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
