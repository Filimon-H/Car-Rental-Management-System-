import { useTranslation } from 'react-i18next'

/**
 * In-app replacement for window.confirm().
 *
 * A native confirm() blocks the whole page until it is dismissed, cannot be
 * styled or translated, and is invisible to anything driving the browser —
 * activation appeared to freeze the app entirely because of one.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  isLoading = false,
  destructive = false,
}: {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
  isLoading?: boolean
  destructive?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="confirm-modal-title" className="mb-1 text-lg font-bold text-gray-900">
          {title}
        </h2>
        <p className="mb-4 text-sm text-gray-500">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-700'
            }`}
          >
            {isLoading ? t('common.loading') : (confirmLabel ?? t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
