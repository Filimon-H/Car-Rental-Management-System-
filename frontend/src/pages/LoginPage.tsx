import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Car, Eye, EyeOff, Lock, User } from 'lucide-react'
import { useAuthStore } from '@/services/auth'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(username, password)
      navigate('/agreements')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }, message?: string }
      const message =
        error?.response?.data?.detail || error?.message || t('auth.invalidCredentials')
      setError(message)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden bg-slate-900 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Car className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">FleetOps</h1>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('auth.adminDashboard')}</p>
              </div>
            </div>

            <div className="mt-14">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-blue-200">
                {t('auth.carRentalManagement')}
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">
                {t('auth.manageAgreements')}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
                {t('auth.keepRentalsOrganized')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              t('auth.trackActive'),
              t('auth.manageFleet'),
              t('auth.maintainCustomer'),
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                  <Car className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">FleetOps</h1>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('auth.adminDashboard')}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="app-kicker">{t('auth.signIn')}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                {t('auth.welcomeBack')}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t('auth.signInToContinue')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                  {t('auth.username', 'Username')}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder={t('auth.enterUsername')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  {t('auth.password', 'Password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder={t('auth.enterPassword')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-900 transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {t('auth.signingIn')}
                  </span>
                ) : (
                  t('auth.loginButton')
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
