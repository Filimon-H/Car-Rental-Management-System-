import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImageOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useProtectedFileUrl } from '@/hooks/use-protected-file-url'
import apiClient, { getErrorMessage } from '@/services/apiClient'
import { useAuthStore } from '@/services/auth'

/**
 * Photos attached to an inspection.
 *
 * The inspection_photos table existed but nothing could write to it, so an
 * inspector recording a scratch could not attach the picture that proves it
 * — and damage disputes are settled on those pictures.
 *
 * Files are served only to signed-in staff, so thumbnails are fetched as
 * authenticated blobs rather than linked directly. Adding and removing
 * photos follows the server's rule: allowed until the inspection is signed.
 */

export interface InspectionPhoto {
  id: number
  inspection_id: number
  filename: string
  caption: string | null
  category: string | null
  created_at: string
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

export function InspectionPhotos({
  inspectionId,
  status,
}: {
  inspectionId: number
  status: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const canManage = useAuthStore((s) => s.hasRole('admin', 'inspector'))
  const editable = canManage && status !== 'signed'
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<InspectionPhoto | null>(null)
  const [viewing, setViewing] = useState<{ src: string; alt: string } | null>(null)

  const queryKey = ['inspection-photos', inspectionId]
  const { data: photos = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<InspectionPhoto[]>(`/inspections/${inspectionId}/photos`),
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      // One at a time, so a single bad file does not lose the others.
      const failures: string[] = []
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        try {
          await apiClient.postFormData(`/inspections/${inspectionId}/photos`, form)
        } catch (err) {
          failures.push(`${file.name}: ${getErrorMessage(err)}`)
        }
      }
      if (failures.length) throw new Error(failures.join(' · '))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(getErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/inspections/${inspectionId}/photos/${id}`),
    onSuccess: () => {
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  function onFiles(list: FileList | null) {
    setError('')
    const files = Array.from(list ?? [])
    const rejected = files.filter((f) => !ACCEPTED.includes(f.type) || f.size > MAX_BYTES)
    const accepted = files.filter((f) => !rejected.includes(f))
    if (rejected.length) {
      setError(t('inspectionPhotos.rejected', { names: rejected.map((f) => f.name).join(', ') }))
    }
    if (accepted.length) upload.mutate(accepted)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="rounded-lg border bg-white p-4 md:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">
          {t('inspectionPhotos.title')} {photos.length > 0 && <span className="text-gray-500">({photos.length})</span>}
        </h2>
        {editable && (
          <>
            <input
              ref={inputRef}
              id={`inspection-photo-input-${inspectionId}`}
              type="file"
              accept={ACCEPTED.join(',')}
              // Opens the camera directly on a phone, where these are taken.
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />
            <label
              htmlFor={`inspection-photo-input-${inspectionId}`}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-700 ${
                upload.isPending ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {upload.isPending ? t('inspectionPhotos.uploading') : t('inspectionPhotos.add')}
            </label>
          </>
        )}
      </div>

      {status === 'signed' && canManage && (
        <p className="mb-3 text-xs text-gray-500">{t('inspectionPhotos.locked')}</p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-500">{t('inspectionPhotos.empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              inspectionId={inspectionId}
              photo={photo}
              onOpen={(src) => setViewing({ src, alt: photo.caption || photo.filename })}
              onDelete={editable ? () => setDeleting(photo) : undefined}
            />
          ))}
        </ul>
      )}

      {viewing && (
        <ImageLightbox open src={viewing.src} alt={viewing.alt} onClose={() => setViewing(null)} />
      )}

      {deleting && (
        <ConfirmModal
          title={t('inspectionPhotos.deleteTitle')}
          message={t('inspectionPhotos.deleteMessage', { name: deleting.caption || deleting.filename })}
          confirmLabel={t('inspectionPhotos.deleteConfirm')}
          destructive
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  )
}

function PhotoTile({
  inspectionId,
  photo,
  onOpen,
  onDelete,
}: {
  inspectionId: number
  photo: InspectionPhoto
  onOpen: (src: string) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const { fileUrl, isLoading, hasError } = useProtectedFileUrl(
    `/inspections/${inspectionId}/photos/${photo.id}/file`
  )
  const label = photo.caption || photo.filename

  return (
    <li className="group relative overflow-hidden rounded-lg border bg-gray-50">
      <button
        type="button"
        disabled={!fileUrl}
        onClick={() => fileUrl && onOpen(fileUrl)}
        aria-label={t('inspectionPhotos.view', { name: label })}
        className="flex aspect-[4/3] w-full items-center justify-center"
      >
        {fileUrl ? (
          <img src={fileUrl} alt={label} className="h-full w-full object-cover" />
        ) : hasError ? (
          <ImageOff className="h-6 w-6 text-gray-400" aria-hidden="true" />
        ) : (
          <span className="text-xs text-gray-400">{isLoading ? t('common.loading') : ''}</span>
        )}
      </button>
      {photo.caption && (
        <p className="truncate px-2 py-1 text-xs text-gray-600" title={photo.caption}>
          {photo.caption}
        </p>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('inspectionPhotos.deleteOne', { name: label })}
          className="absolute right-1 top-1 rounded bg-white/90 p-1 text-gray-500 opacity-0 shadow hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

export default InspectionPhotos
