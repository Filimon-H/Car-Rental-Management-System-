import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * Any path with no route.
 *
 * There was no catch-all, so a mistyped or stale link rendered nothing at
 * all — a blank page with no header and no way back.
 */
export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Link to="/" className="inline-block mb-8">
          <img src="/logo.png" alt="Nod Car Rent" className="w-44 h-auto mx-auto" />
        </Link>
        <p className="text-gold text-sm tracking-[0.3em] uppercase mb-3">404</p>
        <h1 className="text-white text-2xl font-bold mb-3">{t('errors.notFoundTitle')}</h1>
        <p className="text-gray-400 mb-8">{t('errors.notFoundBody')}</p>
        <Link
          to="/"
          className="inline-block bg-gold hover:bg-gold-light text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {t('errors.home')}
        </Link>
      </div>
    </main>
  )
}
