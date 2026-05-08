import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'

interface ImageLightboxProps {
  open: boolean
  src: string
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ open, src, alt, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!open) return
    setScale(1)
  }, [open, src])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const clampedScale = useMemo(() => Math.min(5, Math.max(0.2, scale)), [scale])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-zoom-out"
        aria-label="Close image preview"
      />

      <div className="relative z-10 flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="truncate text-sm font-medium text-gray-700">{alt || 'Image Preview'}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScale((s) => s - 0.25)}
              className="rounded-md border px-2 py-1 text-gray-700 hover:bg-gray-50"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale((s) => s + 0.25)}
              className="rounded-md border px-2 py-1 text-gray-700 hover:bg-gray-50"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale(1)}
              className="rounded-md border px-2 py-1 text-gray-700 hover:bg-gray-50"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-2 py-1 text-gray-700 hover:bg-gray-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className="flex flex-1 items-center justify-center bg-gray-100 p-2"
          onWheel={(e) => {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.1 : 0.1
            setScale((s) => s + delta)
          }}
        >
          <img
            src={src}
            alt={alt || 'Preview'}
            className="max-h-[80vh] max-w-full select-none"
            style={{ transform: `scale(${clampedScale})` }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}
