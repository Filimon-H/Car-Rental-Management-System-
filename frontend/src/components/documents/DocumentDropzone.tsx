import { useState, useCallback, useRef } from 'react'
import { Upload, X, FileText, Image, Loader2, CheckCircle } from 'lucide-react'
import { DocumentType, CustomerDocument, customerDocumentsService } from '@/services/customerDocuments'

interface DocumentDropzoneProps {
  customerId: number | null
  docType: DocumentType
  label: string
  existingDocument?: CustomerDocument | null
  onUploadComplete?: (doc: CustomerDocument) => void
  onDelete?: () => void
  disabled?: boolean
}

export function DocumentDropzone({
  customerId,
  docType,
  label,
  existingDocument,
  onUploadComplete,
  onDelete,
  disabled = false,
}: DocumentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedDoc, setUploadedDoc] = useState<CustomerDocument | null>(existingDocument || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return 'Only JPG, PNG, WebP, and PDF files are allowed'
    }
    if (file.size > 10 * 1024 * 1024) {
      return 'File size must be less than 10MB'
    }
    return null
  }

  const handleFile = async (file: File) => {
    const error = validateFile(file)
    if (error) {
      setUploadError(error)
      return
    }

    setUploadError(null)

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreviewUrl(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
    }

    // If no customer ID yet (new customer), just show preview
    if (!customerId) {
      setUploadedDoc({
        id: 0,
        customer_id: 0,
        doc_type: docType,
        file_name: file.name,
        file_path: '',
        file_size: file.size,
        mime_type: file.type,
        created_at: new Date().toISOString(),
      })
      return
    }

    // Upload to server
    setIsUploading(true)
    try {
      const doc = await customerDocumentsService.upload(customerId, docType, file)
      setUploadedDoc(doc)
      onUploadComplete?.(doc)
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
      setPreviewUrl(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (disabled) return
    
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, customerId, docType])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = async () => {
    if (uploadedDoc && uploadedDoc.id && customerId) {
      try {
        await customerDocumentsService.delete(customerId, uploadedDoc.id)
      } catch (err) {
        console.error('Failed to delete document:', err)
      }
    }
    setUploadedDoc(null)
    setPreviewUrl(null)
    onDelete?.()
  }

  const isImage = uploadedDoc?.mime_type?.startsWith('image/') || previewUrl

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      
      {uploadedDoc ? (
        // Show uploaded document
        <div className="relative rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            {previewUrl || isImage ? (
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <Image className="h-full w-full p-3 text-gray-400" />
                )}
              </div>
            ) : (
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border bg-white">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Uploaded</span>
              </div>
              <p className="mt-1 truncate text-sm text-gray-600">{uploadedDoc.file_name}</p>
              <p className="text-xs text-gray-500">
                {(uploadedDoc.file_size / 1024).toFixed(1)} KB
              </p>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={handleRemove}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        // Show dropzone
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="mt-2 text-sm text-gray-600">Uploading...</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
              </p>
              <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP, or PDF (max 10MB)</p>
            </>
          )}
        </div>
      )}
      
      {uploadError && (
        <p className="text-sm text-red-600">{uploadError}</p>
      )}
      
      {!customerId && uploadedDoc && (
        <p className="text-xs text-amber-600">
          Document will be uploaded after customer is saved
        </p>
      )}
    </div>
  )
}

export default DocumentDropzone
