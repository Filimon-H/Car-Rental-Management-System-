import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { contactInfo, telHref } from '../data/cars'
import { accountClaims, type InviteDetails } from '../services/accountClaims'
import { useAuthStore } from '../services/auth'

/**
 * The page a staff invite link opens.
 *
 * Staff create the link for a customer they registered at the counter, having
 * seen their ID. Here the customer picks an email and password, and lands on
 * My Bookings with the rentals we already have for them.
 */
export default function ClaimInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const signInWithToken = useAuthStore((s) => s.signInWithToken)

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    accountClaims
      .invite(token)
      .then((details) => {
        setInvite(details)
        setForm((f) => ({ ...f, email: details.email ?? '' }))
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'This link is not valid.'))
  }, [token])

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      const { access_token } = await accountClaims.acceptInvite(token, form.email.trim(), form.password)
      await signInWithToken(access_token)
      navigate('/my-bookings', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not set up your account')
    } finally {
      setSaving(false)
    }
  }

  const phone = contactInfo.phones[0]
  const input =
    'w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold'

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo.png" alt="Nod Car Rent" className="w-56 h-auto" />
        </Link>

        <div className="bg-dark-200 rounded-2xl p-8">
          {loadError ? (
            <div role="alert" className="space-y-3">
              <h1 className="text-2xl font-bold text-white">This link can't be used</h1>
              <p className="text-gray-400 text-sm">{loadError}</p>
              <p className="text-gray-400 text-sm">
                Call us on <a href={telHref(phone)} className="text-gold">{phone}</a> for a new one,
                or <Link to="/login" className="text-gold">sign in</Link> if you've set it up already.
              </p>
            </div>
          ) : !invite ? (
            <p className="text-gray-400 text-sm" aria-busy="true">Loading…</p>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Welcome, {invite.first_name}</h1>
              <p className="text-gray-400 text-sm mb-6">
                Set up your online account to see your rentals and book cars.
              </p>

              {error && (
                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="claim-email" className="block text-sm text-gray-400 mb-1.5">Email address</label>
                  <input id="claim-email" type="email" required value={form.email} onChange={set('email')}
                         className={input} placeholder="you@example.com" />
                </div>
                <div>
                  <label htmlFor="claim-password" className="block text-sm text-gray-400 mb-1.5">Password</label>
                  <input id="claim-password" type="password" required value={form.password} onChange={set('password')}
                         className={input} placeholder="min 8 characters" />
                </div>
                <div>
                  <label htmlFor="claim-confirm" className="block text-sm text-gray-400 mb-1.5">Confirm password</label>
                  <input id="claim-confirm" type="password" required value={form.confirm} onChange={set('confirm')}
                         className={input} placeholder="••••••••" />
                </div>
                <button type="submit" disabled={saving}
                        className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60">
                  {saving ? 'Setting up…' : 'Set up my account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
