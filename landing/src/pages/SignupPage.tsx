import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../services/auth'

export default function SignupPage() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await signup({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      })
      navigate('/', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <img
            src="/logo.png"
            alt="Nod Car Rent"
            className="w-56 h-auto"
          />
        </Link>

        <div className="bg-dark-200 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
          <p className="text-gray-400 text-sm mb-6">Book cars, track your rentals</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">First name</label>
                <input
                  required
                  value={form.first_name}
                  onChange={set('first_name')}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                  placeholder="Abebe"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Last name</label>
                <input
                  required
                  value={form.last_name}
                  onChange={set('last_name')}
                  className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                  placeholder="Kebede"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Phone number</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={set('phone')}
                className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                placeholder="+251 91 123 4567"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={set('password')}
                className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                placeholder="min 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Confirm password</label>
              <input
                type="password"
                required
                value={form.confirm}
                onChange={set('confirm')}
                className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-gold hover:text-gold-light">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
