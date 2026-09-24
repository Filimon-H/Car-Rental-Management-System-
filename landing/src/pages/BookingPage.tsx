import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Car, Calendar, MapPin, ArrowLeft, User, ChevronRight, Shield } from 'lucide-react'
import { useAuthStore, CustomerProfile } from '../services/auth'
import { bookingService, PriceQuote, PublicVehicle } from '../services/booking'
import { apiClient, uploadsUrl as photoUrl } from '../services/apiClient'

/**
 * Send a datetime-local value as the API's naive wall-clock representation.
 *
 * These columns hold local business time with no offset — the staff app sends
 * them the same way. Passing the value through toISOString() converted it to
 * UTC, so a customer picking 09:00 in Addis Ababa had 06:00 stored and every
 * screen afterwards showed the booking three hours early.
 */
function toWallClockIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value
  return value.length === 16 ? `${value}:00` : value
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

const ID_TYPES = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'kebele_id', label: 'Kebele ID' },
  { value: 'driving_license', label: "Driver's License (as ID)" },
]

// ---------------------------------------------------------------------------
// Step 1 — Personal information
// ---------------------------------------------------------------------------
interface PersonalInfoProps {
  profile: CustomerProfile
  onNext: (data: ProfileFormData) => void
}

interface ProfileFormData {
  id_type: string
  id_number: string
  id_expiry: string
  license_number: string
  license_expiry: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

function PersonalInfoStep({ profile, onNext }: PersonalInfoProps) {
  const [form, setForm] = useState<ProfileFormData>({
    id_type: profile.id_type || '',
    id_number: profile.id_number || '',
    id_expiry: profile.id_expiry ? profile.id_expiry.substring(0, 10) : '',
    license_number: profile.license_number || '',
    license_expiry: profile.license_expiry ? profile.license_expiry.substring(0, 10) : '',
    emergency_contact_name: profile.emergency_contact_name || '',
    emergency_contact_phone: profile.emergency_contact_phone || '',
  })
  const [error, setError] = useState('')

  const set = (k: keyof ProfileFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (!form.id_type || !form.id_number) {
      setError('ID type and ID number are required')
      return
    }
    if (!form.license_number) {
      setError("Driver's license number is required")
      return
    }
    setError('')
    onNext(form)
  }

  return (
    <form onSubmit={handleNext} className="bg-dark-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <User className="h-5 w-5 text-gold" />
        <h3 className="text-white font-semibold text-lg">Your information</h3>
      </div>
      <p className="text-gray-400 text-sm -mt-3">
        Required for rental verification. Saved to your profile for future bookings.
      </p>

      {/* Read-only from signup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Full name</label>
          <div className="w-full bg-dark-300/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-400 text-sm">
            {profile.first_name} {profile.last_name}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Phone</label>
          <div className="w-full bg-dark-300/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-400 text-sm">
            {profile.phone_primary}
          </div>
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* ID */}
      <div>
        <label className="block text-sm text-gray-400 mb-1.5">
          ID type <span className="text-red-400">*</span>
        </label>
        <select
          required
          value={form.id_type}
          onChange={set('id_type')}
          className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
        >
          <option value="">Select ID type…</option>
          {ID_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            ID number <span className="text-red-400">*</span>
          </label>
          <input
            required
            value={form.id_number}
            onChange={set('id_number')}
            placeholder="ET1234567"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">ID expiry date</label>
          <input
            type="date"
            value={form.id_expiry}
            onChange={set('id_expiry')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* Driver's license */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            Driver's license number <span className="text-red-400">*</span>
          </label>
          <input
            required
            value={form.license_number}
            onChange={set('license_number')}
            placeholder="DL-0000000"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">License expiry date</label>
          <input
            type="date"
            value={form.license_expiry}
            onChange={set('license_expiry')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* Emergency contact */}
      <div>
        <label className="block text-sm text-gray-500 mb-3 flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-gray-600" />
          Emergency contact <span className="text-gray-600">(recommended)</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            value={form.emergency_contact_name}
            onChange={set('emergency_contact_name')}
            placeholder="Contact name"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
          <input
            value={form.emergency_contact_phone}
            onChange={set('emergency_contact_phone')}
            placeholder="Contact phone"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        Continue to booking dates
        <ChevronRight className="h-4 w-4" />
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Booking dates + confirm
// ---------------------------------------------------------------------------
interface BookingDatesProps {
  vehicle: PublicVehicle
  profileData: ProfileFormData
  onBack: () => void
  onSubmit: (pickup: string, returnDate: string, pickupLocation: string, returnLocation: string, notes: string) => Promise<void>
  submitting: boolean
  error: string
}

function BookingDatesStep({ vehicle, profileData, onBack, onSubmit, submitting, error }: BookingDatesProps) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 2)

  const [pickup, setPickup] = useState(toLocalDatetimeValue(tomorrow))
  const [returnDate, setReturnDate] = useState(toLocalDatetimeValue(dayAfter))
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [localError, setLocalError] = useState('')
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const days = daysBetween(pickup, returnDate)
  const total = quote ? Number(quote.total) : days * parseFloat(vehicle.daily_rate)

  useEffect(() => {
    if (days <= 0) {
      setQuote(null)
      return
    }
    let cancelled = false
    setQuoteLoading(true)
    const timer = window.setTimeout(() => {
      bookingService.getQuote({
        vehicle_id: vehicle.id,
        pickup_datetime: toWallClockIso(pickup),
        expected_return_datetime: toWallClockIso(returnDate),
      }).then((result) => {
        if (!cancelled) setQuote(result)
      }).catch(() => {
        if (!cancelled) setQuote(null)
      }).finally(() => {
        if (!cancelled) setQuoteLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [days, pickup, returnDate, vehicle.id])
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (new Date(returnDate) <= new Date(pickup)) {
      setLocalError('Return date must be after pickup date')
      return
    }
    setLocalError('')
    await onSubmit(pickup, returnDate, pickupLocation, returnLocation, notes)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Profile summary */}
      <div className="bg-dark-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-gold" /> Your details
          </h3>
          <button type="button" onClick={onBack} className="text-gold text-xs hover:underline">Edit</button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div><span className="text-gray-500">ID:</span> <span className="text-white">{profileData.id_number} ({profileData.id_type.replace('_', ' ')})</span></div>
          <div><span className="text-gray-500">License:</span> <span className="text-white">{profileData.license_number}</span></div>
          {profileData.emergency_contact_name && (
            <div className="col-span-2"><span className="text-gray-500">Emergency:</span> <span className="text-white">{profileData.emergency_contact_name} · {profileData.emergency_contact_phone}</span></div>
          )}
        </div>
      </div>

      <div className="bg-dark-200 rounded-2xl p-6 space-y-5">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gold" />
          Booking dates
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Pickup date & time</label>
            <input
              type="datetime-local"
              required
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Return date & time</label>
            <input
              type="datetime-local"
              required
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Pickup location (optional)
          </label>
          <input
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            placeholder="e.g. Bole International Airport"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Return location (optional)
          </label>
          <input
            value={returnLocation}
            onChange={(e) => setReturnLocation(e.target.value)}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            placeholder="e.g. Bole International Airport"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold resize-none"
            placeholder="Any special requests…"
          />
        </div>

        {days > 0 && (
          <div className="bg-dark-300 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">{quote?.days ?? days} day{(quote?.days ?? days) !== 1 ? 's' : ''}</span>
              <span className="text-gold font-bold text-lg">{quoteLoading ? 'Calculating…' : `${total.toLocaleString()} ETB`}</span>
            </div>
            {quote && <p className="text-gray-500 text-xs mb-1">{quote.pricing_note}</p>}
            <p className="text-gray-600 text-xs">
              + deposit collected at pickup · final price confirmed by staff
            </p>
          </div>
        )}

        {(localError || error) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {localError || error}
          </div>
        )}

        <p className="text-gray-500 text-xs">
          Your request will be reviewed by our team. You'll see the status in My Bookings.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-3 rounded-lg border border-gray-600 text-gray-300 text-sm hover:border-gold hover:text-gold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={submitting || quoteLoading || days <= 0}
            className="flex-1 bg-gold hover:bg-gold-light text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Confirm Booking Request'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BookingPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(true)
  const [step, setStep] = useState<1 | 2>(1)
  const [profileData, setProfileData] = useState<ProfileFormData | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) fetchProfile()
  }, [profile, fetchProfile])

  // Skip step 1 if profile already has all required fields
  useEffect(() => {
    if (profile?.id_number && profile?.license_number) {
      setStep(2)
      setProfileData({
        id_type: profile.id_type || '',
        id_number: profile.id_number,
        id_expiry: profile.id_expiry?.substring(0, 10) || '',
        license_number: profile.license_number,
        license_expiry: profile.license_expiry?.substring(0, 10) || '',
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
      })
    }
  }, [profile])

  useEffect(() => {
    if (!vehicleId) return
    bookingService
      .getVehicle(Number(vehicleId))
      .then((v) => {
        if (v.status !== 'available') navigate('/')
        else setVehicle(v)
      })
      .catch(() => navigate('/'))
      .finally(() => setLoadingVehicle(false))
  }, [vehicleId, navigate])

  async function handleProfileNext(data: ProfileFormData) {
    // Save to backend so it's there for staff
    await apiClient.patch('/me', {
      id_type: data.id_type || null,
      id_number: data.id_number || null,
      // Date-only fields are wall-clock too: toISOString() tagged them UTC,
      // which shifts the calendar day in any zone behind UTC.
      id_expiry: data.id_expiry ? `${data.id_expiry}T00:00:00` : null,
      license_number: data.license_number || null,
      license_expiry: data.license_expiry ? `${data.license_expiry}T00:00:00` : null,
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
    })
    setProfileData(data)
    setStep(2)
  }

  async function handleBooking(pickup: string, returnDate: string, pickupLocation: string, returnLocation: string, notes: string) {
    setError('')
    setSubmitting(true)
    try {
      await bookingService.createBooking({
        vehicle_id: Number(vehicleId),
        pickup_datetime: toWallClockIso(pickup),
        expected_return_datetime: toWallClockIso(returnDate),
        pickup_location: pickupLocation || undefined,
        return_location: returnLocation || undefined,
        notes: notes || undefined,
      })
      navigate('/my-bookings')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingVehicle || !profile) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }

  if (!vehicle) return null

  const photo = photoUrl(vehicle.photo_front)

  return (
    <div className="min-h-screen bg-dark py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gold transition-colors mb-8 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to fleet
        </Link>

        <div className="flex items-center mb-6">
          <img
            src="/logo.png"
            alt="Nod Car Rent"
            className="w-44 h-auto"
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {[{ n: 1, label: 'Your info' }, { n: 2, label: 'Dates & confirm' }].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === n ? 'bg-gold text-white' : step > n ? 'bg-green-500 text-white' : 'bg-dark-300 text-gray-500'}`}>
                {step > n ? '✓' : n}
              </div>
              <span className={`text-sm ${step === n ? 'text-white' : 'text-gray-500'}`}>{label}</span>
              {n < 2 && <ChevronRight className="h-4 w-4 text-gray-600" />}
            </div>
          ))}
        </div>

        {/* Vehicle summary */}
        <div className="bg-dark-200 rounded-2xl p-5 mb-6 flex items-center gap-4">
          {photo ? (
            <img src={photo} alt={`${vehicle.make} ${vehicle.model}`} className="w-24 h-16 object-cover rounded-lg" />
          ) : (
            <div className="w-24 h-16 bg-dark-300 rounded-lg flex items-center justify-center">
              <Car className="h-8 w-8 text-gray-600" />
            </div>
          )}
          <div>
            <h2 className="text-white font-semibold text-lg">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
            <p className="text-gray-400 text-sm">{vehicle.vehicle_type} · {vehicle.seats} seats · {vehicle.transmission}</p>
            <p className="text-gold font-semibold mt-1">{Number(vehicle.daily_rate).toLocaleString()} ETB / day</p>
          </div>
        </div>

        {step === 1 && (
          <PersonalInfoStep profile={profile} onNext={handleProfileNext} />
        )}
        {step === 2 && profileData && (
          <BookingDatesStep
            vehicle={vehicle}
            profileData={profileData}
            onBack={() => setStep(1)}
            onSubmit={handleBooking}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </div>
  )
}
