import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, X, FileText, Image, Loader2, CheckCircle } from 'lucide-react'
import { DocumentType, CustomerDocument, customerDocumentsService } from '@/services/customerDocuments'
import { CollateralDocument, collateralDocumentsService } from '@/services/collateralDocuments'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useProtectedFileUrl } from '@/hooks/use-protected-file-url'

interface DocumentDropzoneProps {
  ownerType?: 'customer' | 'collateral'
  customerId?: number | null
  collateralId?: number | null
  docType: DocumentType
  label: string
  existingDocument?: CustomerDocument | CollateralDocument | null
  onUploadComplete?: (doc: CustomerDocument | CollateralDocument) => void
  onFileSelected?: (file: File | null) => void
  onDelete?: () => void
  disabled?: boolean
}

export function DocumentDropzone({
  ownerType = 'customer',
  customerId = null,
  collateralId = null,
  docType,
  label,
  existingDocument,
  onUploadComplete,
  onFileSelected,
  onDelete,
  disabled = false,
}: DocumentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedDoc, setUploadedDoc] = useState<CustomerDocument | CollateralDocument | null>(
    existingDocument || null
  )
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const ownerId = ownerType === 'customer' ? customerId : collateralId

  // Sync with existingDocument prop when it changes
  useEffect(() => {
    if (existingDocument) {
      setUploadedDoc(existingDocument)
    }
  }, [existingDocument])

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

  const handleFile = useCallback(async (file: File) => {
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

    // If no owner ID yet (new entity), just show preview
    if (!ownerId) {
      setUploadedDoc({
        id: 0,
        ...(ownerType === 'customer' ? { customer_id: 0 } : { collateral_id: 0 }),
        doc_type: docType,
        file_name: file.name,
        file_path: '',
        file_size: file.size,
        mime_type: file.type,
        created_at: new Date().toISOString(),
      })
      onFileSelected?.(file)
      return
    }

    // Upload to server
    setIsUploading(true)
    try {
      console.log('Uploading document:', { ownerType, ownerId, docType, fileName: file.name })
      const doc =
        ownerType === 'customer'
          ? await customerDocumentsService.upload(ownerId, docType, file)
          : await collateralDocumentsService.upload(ownerId, docType, file)
      console.log('Upload successful:', doc)
      setUploadedDoc(doc)
      onUploadComplete?.(doc)
      onFileSelected?.(null)
    } catch (err: unknown) {
      console.error('Upload failed:', err)
      const error = err as Error
      setUploadError(error.message || 'Upload failed')
      setPreviewUrl(null)
    } finally {
      setIsUploading(false)
    }
  }, [docType, onFileSelected, onUploadComplete, ownerId, ownerType])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (disabled) return
    
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, handleFile])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = async () => {
    if (uploadedDoc && uploadedDoc.id && ownerId) {
      try {
        if (ownerType === 'customer') {
          await customerDocumentsService.delete(ownerId, uploadedDoc.id)
        } else {
          await collateralDocumentsService.delete(ownerId, uploadedDoc.id)
        }
      } catch (err) {
        console.error('Failed to delete document:', err)
      }
    }
    setUploadedDoc(null)
    setPreviewUrl(null)
    onFileSelected?.(null)
    onDelete?.()
  }

  const isImage = uploadedDoc?.mime_type?.startsWith('image/') || !!previewUrl
  const serverImagePath = (() => {
    if (!uploadedDoc?.id) return ''
    if (ownerType === 'customer' && (uploadedDoc as CustomerDocument).customer_id) {
      const doc = uploadedDoc as CustomerDocument
      return `/api/customers/${doc.customer_id}/documents/${doc.id}/file`
    }
    if (ownerType === 'collateral' && (uploadedDoc as CollateralDocument).collateral_id) {
      const doc = uploadedDoc as CollateralDocument
      return `/api/collaterals/${doc.collateral_id}/documents/${doc.id}/file`
    }
    return ''
  })()
  const { fileUrl: serverImageSrc, isLoading: isServerImageLoading } = useProtectedFileUrl(
    previewUrl ? null : serverImagePath,
    !previewUrl && isImage
  )
  const lightboxSrc = previewUrl || serverImageSrc

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      
      {uploadedDoc ? (
        // Show uploaded document
        <>
          <div className="relative rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
            {previewUrl || isImage ? (
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-full w-full cursor-zoom-in object-cover"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightboxOpen(true)
                    }}
                  />
                ) : serverImageSrc ? (
                  <img
                    src={serverImageSrc}
                    alt={uploadedDoc.file_name}
                    className="h-full w-full cursor-zoom-in object-cover"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightboxOpen(true)
                    }}
                  />
                ) : isServerImageLoading ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
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

          {isImage && lightboxSrc && (
            <ImageLightbox
              open={lightboxOpen}
              src={lightboxSrc}
              alt={uploadedDoc?.file_name || label}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
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
      
      {!ownerId && uploadedDoc && (
        <p className="text-xs text-amber-600">
          Document will be uploaded after save
        </p>
      )}
    </div>
  )
}

export default DocumentDropzone
