import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../services/auth'
import { useAdminAuthStore } from '../services/adminAuth'
import { ADMIN_BASE_URL } from '../services/apiClient'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
  const login = useAuthStore((s) => s.login)
  const adminLogin = useAdminAuthStore((s) => s.adminLogin)

  const [mode, setMode] = useState<'customer' | 'admin'>('customer')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(next: 'customer' | 'admin') {
    setMode(next)
    setError('')
    setPassword('')
  }

  async function handleCustomerSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(username, password)
      const at = localStorage.getItem('admin_access_token') || ''
      const rt = localStorage.getItem('admin_refresh_token') || ''
      const params = new URLSearchParams({ at, rt })
      window.location.href = `${ADMIN_BASE_URL}/login?${params.toString()}`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.invalidCredentials'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <img
            src="/logo.png"
            alt="Nod Car Rent"
            className="w-56 h-auto"
          />
        </Link>

        <div className="bg-dark-200 rounded-2xl p-8">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-dark-300 p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode('customer')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'customer' ? 'bg-gold text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('login.customer')}
            </button>
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                mode === 'admin' ? 'bg-gold text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              {t('login.admin')}
            </button>
          </div>

          {mode === 'customer' ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">{t('login.welcomeBack')}</h1>
              <p className="text-gray-400 text-sm mb-6">{t('login.signInToManage')}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">{t('login.adminLogin')}</h1>
              <p className="text-gray-400 text-sm mb-6">{t('login.signInWithStaff')}</p>
            </>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {mode === 'customer' ? (
            <form onSubmit={handleCustomerSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{t('login.emailAddress')}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{t('login.password')}</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? t('login.signingIn') : t('login.signInButton')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{t('login.username')}</label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{t('login.password')}</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? t('login.signingIn') : t('login.accessAdminPanel')}
              </button>
            </form>
          )}

          {mode === 'customer' && (
            <p className="text-center text-gray-500 text-sm mt-6">
              {t('login.dontHaveAccount')}{' '}
              <Link to="/signup" className="text-gold hover:text-gold-light">
                {t('login.createOne')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
