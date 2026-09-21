import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Car, Calendar, X, ArrowLeft, Send, Copy, Check, ExternalLink, Clock, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../services/auth'
import { bookingService, MyBooking, TelegramLinkCode, TelegramLinkStatus, STATUS_LABELS, STATUS_COLORS } from '../services/booking'

function getDaysLeft(returnDateIso: string): number {
  return Math.floor((new Date(returnDateIso).getTime() - Date.now()) / 86400000)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ET', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MyBookingsPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<number | null>(null)

  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus | null>(null)
  const [linkCode, setLinkCode] = useState<TelegramLinkCode | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [copied, setCopied] = useState(false)

  const [extendingId, setExtendingId] = useState<number | null>(null)
  const [extendDate, setExtendDate] = useState('')
  const [extendConfirming, setExtendConfirming] = useState(false)
  const [extendError, setExtendError] = useState('')
  const [extendLoading, setExtendLoading] = useState(false)

  const loadTelegramStatus = useCallback(() => {
    bookingService.getTelegramStatus().then(setTelegramStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: '/my-bookings' }, replace: true })
      return
    }
    if (!profile) fetchProfile()
    bookingService
      .getMyBookings()
      .then(setBookings)
      .finally(() => setLoading(false))
    loadTelegramStatus()
  }, [token, navigate, profile, fetchProfile, loadTelegramStatus])

  async function handleGenerateLinkCode() {
    setGeneratingCode(true)
    try {
      const code = await bookingService.generateTelegramLinkCode()
      setLinkCode(code)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate code')
    } finally {
      setGeneratingCode(false)
    }
  }

  async function handleCopyCode() {
    if (!linkCode) return
    await navigator.clipboard.writeText(`/link ${linkCode.code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getExtendDays(booking: MyBooking) {
    if (!extendDate) return 0
    const current = new Date(booking.expected_return_datetime).getTime()
    // picked date at same time as current return
    const picked = new Date(extendDate + 'T' + new Date(booking.expected_return_datetime).toISOString().slice(11, 16)).getTime()
    return Math.round((picked - current) / 86400000)
  }

  async function handleExtend(booking: MyBooking) {
    if (!extendDate) { setExtendError('Please pick a return date'); return }
    const returnTime = new Date(booking.expected_return_datetime).toISOString().slice(11, 19)
    const newDt = new Date(`${extendDate}T${returnTime}Z`).toISOString()
    setExtendLoading(true)
    setExtendError('')
    try {
      const updated = await bookingService.extendBooking(booking.id, newDt)
      setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
      setExtendingId(null)
      setExtendDate('')
      setExtendConfirming(false)
    } catch (err: unknown) {
      setExtendError(err instanceof Error ? err.message : 'Failed to extend')
      setExtendConfirming(false)
    } finally {
      setExtendLoading(false)
    }
  }

  async function handleCancel(id: number) {
    if (!confirm('Cancel this booking?')) return
    setCancelling(id)
    try {
      await bookingService.cancelBooking(id)
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b))
      )
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setCancelling(null)
    }
  }

  if (!token) return null

  return (
    <div className="min-h-screen bg-dark py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gold transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <button onClick={logout} className="text-gray-500 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>

        <div className="flex items-center mb-2">
          <img
            src="/logo.png"
            alt="Nod Car Rent"
            className="w-44 h-auto"
          />
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">My Bookings</h1>
        {profile && (
          <p className="text-gray-400 text-sm mb-6">
            {profile.first_name} {profile.last_name} · {profile.phone_primary}
          </p>
        )}

        {loading ? (
          <div className="text-gray-400 text-center py-12">Loading…</div>
        ) : bookings.length === 0 ? (
          <div className="bg-dark-200 rounded-2xl p-10 text-center">
            <Car className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">You haven't made any bookings yet.</p>
            <Link
              to="/#cars"
              className="inline-block bg-gold hover:bg-gold-light text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse our fleet
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => (
              <div key={b.id} className="bg-dark-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-white font-semibold text-sm">{b.agreement_number}</p>
                    {b.vehicle && (
                      <p className="text-gray-400 text-sm mt-0.5">
                        {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                      STATUS_COLORS[b.status] || 'text-gray-400 bg-gray-400/10'
                    }`}
                  >
                    {STATUS_LABELS[b.status] || b.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(b.pickup_datetime)} → {formatDate(b.expected_return_datetime)}</span>
                </div>

                {/* Days left banner for active rentals */}
                {b.status === 'active' && (() => {
                  const days = getDaysLeft(b.expected_return_datetime)
                  if (days < 0) return (
                    <div className="flex items-center gap-2 mt-2 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                      <span className="text-red-400 text-xs font-semibold">OVERDUE — please return the vehicle or contact us</span>
                    </div>
                  )
                  const color = days <= 1 ? 'text-red-400 bg-red-400/10 border-red-400/20'
                    : days <= 3 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
                    : 'text-green-400 bg-green-400/10 border-green-400/20'
                  return (
                    <div className={`flex items-center gap-2 mt-2 border rounded-lg px-3 py-2 ${color}`}>
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs font-semibold">{days} day{days !== 1 ? 's' : ''} left to return</span>
                    </div>
                  )
                })()}

                {/* Payment summary */}
                {b.total_charge !== null && (
                  <div className="mt-3 border-t border-gray-700/50 pt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Total charge</p>
                      <p className="text-white font-medium">{Number(b.total_charge).toLocaleString()} ETB</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Paid</p>
                      <p className="text-green-400 font-medium">{Number(b.total_paid ?? 0).toLocaleString()} ETB</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Balance due</p>
                      <p className={`font-bold ${Number(b.balance_due) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {Number(b.balance_due ?? 0).toLocaleString()} ETB
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                  <span className="text-gold font-semibold text-sm">
                    {Number(b.agreed_daily_rate).toLocaleString()} ETB / day
                  </span>
                  <div className="flex gap-2">
                    {(b.status === 'active' || b.status === 'pending_payment' || b.status === 'booking_requested') && (
                      <button
                        onClick={() => { setExtendingId(b.id); setExtendDate(''); setExtendError('') }}
                        className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs border border-blue-400/30 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Extend
                      </button>
                    )}
                    {(b.status === 'booking_requested' || b.status === 'pending_payment') && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        disabled={cancelling === b.id}
                        className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs border border-red-400/30 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Extend panel */}
                {extendingId === b.id && (
                  <div className="mt-4 border-t border-gray-700 pt-4">
                    {!extendConfirming ? (
                      <>
                        <p className="text-white text-sm font-semibold mb-1">Select new return date</p>
                        <p className="text-gray-500 text-xs mb-3">
                          Current return: <span className="text-gray-300">{new Date(b.expected_return_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          {' '}— only dates after this are selectable.
                        </p>
                        <input
                          type="date"
                          value={extendDate}
                          min={new Date(b.expected_return_datetime).toISOString().slice(0, 10)}
                          onChange={e => { setExtendDate(e.target.value); setExtendError('') }}
                          className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm mb-3 focus:outline-none focus:border-gold [color-scheme:dark]"
                        />
                        {extendError && <p className="text-red-400 text-xs mb-2">{extendError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!extendDate) { setExtendError('Please pick a date'); return }
                              setExtendConfirming(true)
                            }}
                            className="bg-gold hover:bg-gold-light text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            Next →
                          </button>
                          <button
                            onClick={() => { setExtendingId(null); setExtendDate(''); setExtendError('') }}
                            className="text-gray-400 hover:text-white text-xs px-3 py-2 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Confirmation preview */}
                        <p className="text-white text-sm font-semibold mb-3">Confirm Extension</p>
                        <div className="bg-dark rounded-xl p-4 space-y-2 mb-4">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Current return</span>
                            <span className="text-white">{new Date(b.expected_return_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">New return</span>
                            <span className="text-white">{new Date(extendDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="border-t border-gray-700 pt-2 flex justify-between text-sm">
                            <span className="text-gray-300 font-medium">Extra days</span>
                            <span className="text-gold font-bold">+{getExtendDays(b)} days</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300 font-medium">Additional cost</span>
                            <span className="text-gold font-bold">
                              {(getExtendDays(b) * Number(b.agreed_daily_rate)).toLocaleString()} ETB
                            </span>
                          </div>
                        </div>
                        {extendError && <p className="text-red-400 text-xs mb-2">{extendError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExtend(b)}
                            disabled={extendLoading}
                            className="bg-gold hover:bg-gold-light text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
                          >
                            {extendLoading ? 'Saving…' : 'Confirm Extension'}
                          </button>
                          <button
                            onClick={() => setExtendConfirming(false)}
                            className="text-gray-400 hover:text-white text-xs px-3 py-2 transition-colors"
                          >
                            ← Back
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Telegram Connect Section */}
        <div className="mt-10 bg-dark-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#229ED9]/20 flex items-center justify-center flex-shrink-0">
              <Send className="h-5 w-5 text-[#229ED9]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Telegram Bot</h2>
              <p className="text-gray-400 text-xs">Browse and book cars directly from Telegram</p>
            </div>
          </div>

          {telegramStatus?.linked ? (
            <div className="flex items-center gap-2 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
              <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 text-sm font-medium">
                  Linked{telegramStatus.telegram_username ? ` as @${telegramStatus.telegram_username}` : ''}
                </p>
                {telegramStatus.linked_at && (
                  <p className="text-gray-500 text-xs">
                    Connected {new Date(telegramStatus.linked_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <a
                href="https://t.me/Novacar67_bot"
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1.5 text-[#229ED9] text-xs font-medium hover:underline"
              >
                Open bot <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <>
              {!linkCode ? (
                <div>
                  <p className="text-gray-400 text-sm mb-4">
                    Link your account to <span className="text-[#229ED9]">@Novacar67_bot</span> to book cars,
                    check your reservations, and get updates — all without opening a browser.
                  </p>
                  <button
                    onClick={handleGenerateLinkCode}
                    disabled={generatingCode}
                    className="flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc4] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    {generatingCode ? 'Generating…' : 'Get Link Code'}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-3">
                    Open <a href="https://t.me/Novacar67_bot" target="_blank" rel="noreferrer" className="text-[#229ED9] hover:underline">@Novacar67_bot</a> on Telegram and send this command:
                  </p>
                  <div className="flex items-center gap-2 bg-dark rounded-xl px-4 py-3 mb-3">
                    <code className="text-gold font-mono text-lg tracking-widest flex-1">
                      /link {linkCode.code}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-green-400" />
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs mb-4">
                    Expires at {new Date(linkCode.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' '}· Code is single-use
                  </p>
                  <div className="flex gap-3">
                    <a
                      href="https://t.me/Novacar67_bot"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc4] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
                    >
                      <Send className="h-4 w-4" />
                      Open @Novacar67_bot
                    </a>
                    <button
                      onClick={() => { setLinkCode(null); handleGenerateLinkCode() }}
                      className="text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      New code
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
