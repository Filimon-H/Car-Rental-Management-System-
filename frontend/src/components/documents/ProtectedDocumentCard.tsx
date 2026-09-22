import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useProtectedFileUrl } from '@/hooks/use-protected-file-url'

interface ProtectedDocument {
  id: number
  doc_type: string
  file_name: string
  mime_type: string
}

interface ProtectedDocumentCardProps {
  document: ProtectedDocument
  ownerType: 'customer' | 'collateral'
  ownerId: number
}

const documentLabelKeys: Record<string, string> = {
  passport: 'passport',
  national_id: 'nationalId',
  kebele_id: 'kebeleId',
  driver_license: 'driverLicense',
}

export function ProtectedDocumentCard({
  document,
  ownerType,
  ownerId,
}: ProtectedDocumentCardProps) {
  const { t } = useTranslation()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const ownerPath = ownerType === 'customer' ? 'customers' : 'collaterals'
  const filePath = `/${ownerPath}/${ownerId}/documents/${document.id}/file`
  const { fileUrl, isLoading, hasError } = useProtectedFileUrl(filePath)
  const isImage = document.mime_type.startsWith('image/')
  const labelKey = documentLabelKeys[document.doc_type]
  const typeLabel = labelKey ? t(`customerCreate.${labelKey}`) : document.doc_type

  function openDocument() {
    if (!fileUrl) return
    if (isImage) {
      setLightboxOpen(true)
      return
    }
    window.open(fileUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
      <button
        type="button"
        onClick={openDocument}
        disabled={!fileUrl}
        aria-label={`${t('common.view')} ${document.file_name}`}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:cursor-wait"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : hasError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-red-600">
              <FileText className="h-10 w-10" />
              <span className="text-xs font-medium">{t('customerDetail.documentLoadError')}</span>
            </div>
          ) : isImage && fileUrl ? (
            <img
              src={fileUrl}
              alt={document.file_name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <FileText className="h-12 w-12" />
              <span className="text-xs font-medium uppercase">{document.file_name.split('.').pop()}</span>
            </div>
          )}
          {fileUrl && (
            <span className="absolute right-2 top-2 rounded-full bg-gray-900/75 p-1.5 text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <ExternalLink className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="px-3 pb-2 pt-3">
          <p className="text-xs font-semibold text-gray-800">{typeLabel}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{document.file_name}</p>
        </div>
      </button>

      <div className="border-t border-gray-100 px-3 py-2">
        {fileUrl ? (
          <a
            href={fileUrl}
            download={document.file_name}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Download className="h-3.5 w-3.5" />
            {t('common.download')}
          </a>
        ) : hasError ? (
          <span className="text-xs font-medium text-red-600">{t('customerDetail.documentLoadError')}</span>
        ) : (
          <span className="text-xs text-gray-400">{t('common.loading')}</span>
        )}
      </div>

      {isImage && fileUrl && (
        <ImageLightbox
          open={lightboxOpen}
          src={fileUrl}
          alt={document.file_name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </article>
  )
}
