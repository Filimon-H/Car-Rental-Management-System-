import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

/**
 * Catches a render error anywhere below it.
 *
 * Without one, a single component throwing — a malformed API field, say —
 * unmounted the whole tree and left a visitor on a blank black page with
 * no way forward. This shows what happened and two ways out.
 *
 * Class component because React has no hook for error boundaries, so it
 * reads strings from i18n directly rather than through useTranslation.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const t = i18n.t.bind(i18n)
    return (
      <main className="min-h-screen bg-dark flex items-center justify-center px-4">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-white text-2xl font-bold mb-3">{t('errors.title')}</h1>
          <p className="text-gray-400 mb-8">{t('errors.body')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-gold hover:bg-gold-light text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              {t('errors.reload')}
            </button>
            <a
              href="/"
              className="border border-gray-600 text-gray-300 hover:border-gold hover:text-gold px-6 py-3 rounded-lg transition-colors"
            >
              {t('errors.home')}
            </a>
          </div>
        </div>
      </main>
    )
  }
}
