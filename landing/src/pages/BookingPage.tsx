import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { Car, Calendar, MapPin, ArrowLeft, User, ChevronRight, Shield } from 'lucide-react'
import { useAuthStore, CustomerProfile } from '../services/auth'
import { bookingService, PriceQuote, PublicVehicle } from '../services/booking'
import { apiClient, uploadsUrl as photoUrl } from '../services/apiClient'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

/**
 * Send a datetime-local value as the API's naive wall-clock representation.
 *
 * These columns hold local business time with no offset — the staff app sends
 * them the same way. Passing the value through toISOString() converted it to
 * UTC, so a customer picking 09:00 in Addis Ababa had 06:00 stored and every
 * screen afterwards showed the booking three hours early.
 */
/**
 * Whether a recorded expiry date has already passed.
 *
 * The expiry inputs accepted any past date with no feedback: a customer
 * whose licence expired months ago could book with nothing on screen saying
 * so. The server refuses a licence that expires before the return date; this
 * says so at the point of entry, where it can still be corrected.
 */
function isExpired(value: string): boolean {
  if (!value) return false
  const when = new Date(value)
  if (Number.isNaN(when.getTime())) return false
  return when < new Date(new Date().toDateString())
}

function formatExpiry(value: string): string {
  // Was pinned to en-GB, so the Amharic page still printed English dates.
  return new Date(value).toLocaleDateString(i18n.language?.startsWith('am') ? 'am-ET' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

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

/** ID types the backend accepts; labels come from booking.idTypes.* */
const ID_TYPES = ['national_id', 'passport', 'kebele_id', 'driving_license'] as const

/** The two notes the quote endpoint sends, mapped to translations. */
const PRICING_NOTES: Record<string, string> = {
  'Best weekly/monthly tier applied': 'booking.tierApplied',
  'Daily rate applied': 'booking.dailyRateApplied',
}

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
  const { t } = useTranslation()
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
      setError(t('booking.idRequired'))
      return
    }
    if (!form.license_number) {
      setError(t('booking.licenceRequired'))
      return
    }
    setError('')
    onNext(form)
  }

  return (
    <form onSubmit={handleNext} className="bg-dark-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <User className="h-5 w-5 text-gold" />
        <h3 className="text-white font-semibold text-lg">{t('booking.yourInformation')}</h3>
      </div>
      <p className="text-gray-400 text-sm -mt-3">
        {t('booking.verificationNote')}
      </p>

      {/* Read-only from signup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="block text-xs text-gray-500 mb-1">{t('booking.fullName')}</p>
          <div className="w-full bg-dark-300/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-400 text-sm">
            {profile.first_name} {profile.last_name}
          </div>
        </div>
        <div>
          <p className="block text-xs text-gray-500 mb-1">{t('booking.phone')}</p>
          <div className="w-full bg-dark-300/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-400 text-sm">
            {profile.phone_primary}
          </div>
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* ID */}
      <div>
        <label htmlFor="booking-id-type" className="block text-sm text-gray-400 mb-1.5">
          {t('booking.idType')} <span className="text-red-400" aria-hidden="true">*</span>
        </label>
        <select
          id="booking-id-type"
          required
          value={form.id_type}
          onChange={set('id_type')}
          className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
        >
          <option value="">{t('booking.selectIdType')}</option>
          {ID_TYPES.map((type) => (
            <option key={type} value={type}>{t(`booking.idTypes.${type}`)}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="booking-id-number" className="block text-sm text-gray-400 mb-1.5">
            {t('booking.idNumber')} <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="booking-id-number"
            required
            value={form.id_number}
            onChange={set('id_number')}
            placeholder="ET1234567"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="booking-id-expiry" className="block text-sm text-gray-400 mb-1.5">{t('booking.idExpiry')}</label>
          <input
            id="booking-id-expiry"
            type="date"
            value={form.id_expiry}
            onChange={set('id_expiry')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
          {isExpired(form.id_expiry) && (
            <p className="text-amber-400 text-xs mt-1.5">
              {t('booking.idExpired', { date: formatExpiry(form.id_expiry) })}
            </p>
          )}
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* Driver's license */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="booking-licence-number" className="block text-sm text-gray-400 mb-1.5">
            {t('booking.licenceNumber')} <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="booking-licence-number"
            required
            value={form.license_number}
            onChange={set('license_number')}
            placeholder="DL-0000000"
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="booking-licence-expiry" className="block text-sm text-gray-400 mb-1.5">{t('booking.licenceExpiry')}</label>
          <input
            id="booking-licence-expiry"
            type="date"
            value={form.license_expiry}
            onChange={set('license_expiry')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
          {isExpired(form.license_expiry) && (
            <p role="alert" className="text-amber-400 text-xs mt-1.5">
              {t('booking.licenceExpired', { date: formatExpiry(form.license_expiry) })}
            </p>
          )}
        </div>
      </div>

      <hr className="border-gray-700" />

      {/* Emergency contact */}
      <div>
        <p id="booking-emergency" className="block text-sm text-gray-500 mb-3 flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-gray-600" aria-hidden="true" />
          {t('booking.emergencyContact')} <span className="text-gray-600">{t('booking.recommended')}</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            value={form.emergency_contact_name}
            onChange={set('emergency_contact_name')}
            aria-label={`${t('booking.emergencyContact')}: ${t('booking.contactName')}`}
            placeholder={t('booking.contactName')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
          <input
            value={form.emergency_contact_phone}
            onChange={set('emergency_contact_phone')}
            type="tel"
            aria-label={`${t('booking.emergencyContact')}: ${t('booking.contactPhone')}`}
            placeholder={t('booking.contactPhone')}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {t('booking.continueToDates')}
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
  /** Clears the parent's submission error once the customer edits the dates. */
  onClearError: () => void
  /** Dates survive a trip back to step 1; see the state in BookingPage. */
  initialDates: { pickup: string; returnDate: string } | null
  onDatesChange: (dates: { pickup: string; returnDate: string }) => void
}

function BookingDatesStep({ vehicle, profileData, onBack, onSubmit, submitting, error, onClearError, initialDates, onDatesChange }: BookingDatesProps) {
  const { t } = useTranslation()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 2)

  const [pickup, setPickup] = useState(
    initialDates?.pickup ?? toLocalDatetimeValue(tomorrow)
  )
  const [returnDate, setReturnDate] = useState(
    initialDates?.returnDate ?? toLocalDatetimeValue(dayAfter)
  )
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [localError, setLocalError] = useState('')
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const days = daysBetween(pickup, returnDate)
  const total = quote ? Number(quote.total) : days * parseFloat(vehicle.daily_rate)

  /*
    The pickup input had no min, so a date three weeks past was selectable,
    priced, and only rejected after a round-trip. The return input had none
    either, so return-before-pickup silently hid the whole price summary and
    disabled Confirm with nothing on screen explaining why.
  */
  const minPickup = toLocalDatetimeValue(new Date())
  const pickupInPast = pickup !== '' && new Date(pickup) <= new Date()
  const returnBeforePickup = pickup !== '' && returnDate !== '' && days <= 0
  const blockedReason = pickupInPast
    ? t('booking.pickupInPast')
    : returnBeforePickup
      ? t('booking.returnBeforePickup')
      : ''

  /** Editing either date invalidates any previous complaint about them. */
  const changeDates = (next: () => void) => {
    next()
    setLocalError('')
    onClearError()
  }

  useEffect(() => {
    onDatesChange({ pickup, returnDate })
  }, [pickup, returnDate, onDatesChange])

  useEffect(() => {
    // No point pricing a range the server will reject.
    if (days <= 0 || pickupInPast) {
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
  }, [days, pickup, returnDate, pickupInPast, vehicle.id])
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (new Date(returnDate) <= new Date(pickup)) {
      setLocalError(t('booking.returnBeforePickup'))
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
            <User className="h-4 w-4 text-gold" aria-hidden="true" /> {t('booking.yourDetails')}
          </h3>
          <button type="button" onClick={onBack} className="text-gold text-xs hover:underline">{t('booking.edit')}</button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-gray-500">{t('booking.idLabel')}:</span>{' '}
            <span className="text-white">{profileData.id_number} ({t(`booking.idTypes.${profileData.id_type}`, profileData.id_type)})</span>
            {isExpired(profileData.id_expiry) && (
              <span className="text-amber-400"> · {t('booking.expiredOn', { date: formatExpiry(profileData.id_expiry) })}</span>
            )}
          </div>
          <div>
            <span className="text-gray-500">{t('booking.licenceLabel')}:</span>{' '}
            <span className="text-white">{profileData.license_number}</span>
            {/*
              The expiry warnings lived only on step 1, so at the moment of
              confirming, the summary showed a licence number with nothing
              flagged — the customer saw no problem until submission failed.
            */}
            {isExpired(profileData.license_expiry) && (
              <span className="text-amber-400"> · {t('booking.expiredOn', { date: formatExpiry(profileData.license_expiry) })}</span>
            )}
          </div>
          {profileData.emergency_contact_name && (
            <div className="col-span-2"><span className="text-gray-500">{t('booking.emergencyLabel')}:</span> <span className="text-white">{profileData.emergency_contact_name} · {profileData.emergency_contact_phone}</span></div>
          )}
        </div>
      </div>

      <div className="bg-dark-200 rounded-2xl p-6 space-y-5">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gold" aria-hidden="true" />
          {t('booking.bookingDates')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="booking-pickup" className="block text-sm text-gray-400 mb-1.5">{t('booking.pickupDateTime')}</label>
            <input
              id="booking-pickup"
              type="datetime-local"
              required
              min={minPickup}
              value={pickup}
              onChange={(e) => changeDates(() => setPickup(e.target.value))}
              className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label htmlFor="booking-return" className="block text-sm text-gray-400 mb-1.5">{t('booking.returnDateTime')}</label>
            <input
              id="booking-return"
              type="datetime-local"
              required
              min={pickup || minPickup}
              value={returnDate}
              onChange={(e) => changeDates(() => setReturnDate(e.target.value))}
              className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="booking-pickup-location" className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {t('booking.pickupLocation')}
          </label>
          <input
            id="booking-pickup-location"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            placeholder={t('booking.locationPlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="booking-return-location" className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {t('booking.returnLocation')}
          </label>
          <input
            id="booking-return-location"
            value={returnLocation}
            onChange={(e) => setReturnLocation(e.target.value)}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold"
            placeholder={t('booking.locationPlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="booking-notes" className="block text-sm text-gray-400 mb-1.5">{t('booking.notes')}</label>
          <textarea
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold resize-none"
            placeholder={t('booking.notesPlaceholder')}
          />
        </div>

        {blockedReason && (
          <p role="alert" className="text-amber-400 text-sm">
            {blockedReason}
          </p>
        )}

        {days > 0 && !blockedReason && (
          <div className="bg-dark-300 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">{t('booking.days', { count: quote?.days ?? days })}</span>
              <span className="text-gold font-bold text-lg">{quoteLoading ? t('booking.calculating') : `${total.toLocaleString()} ETB`}</span>
            </div>
            {quote && (
              <p className="text-gray-500 text-xs mb-1">
                {PRICING_NOTES[quote.pricing_note] ? t(PRICING_NOTES[quote.pricing_note]) : quote.pricing_note}
              </p>
            )}
            <p className="text-gray-600 text-xs">
              {t('booking.depositNote')}
            </p>
          </div>
        )}

        {(localError || error) && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {localError || error}
          </div>
        )}

        <p className="text-gray-500 text-xs">
          {t('booking.reviewNote')}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            aria-label={t('booking.backToDetails')}
            onClick={onBack}
            className="px-5 py-3 rounded-lg border border-gray-600 text-gray-300 text-sm hover:border-gold hover:text-gold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={submitting || quoteLoading || days <= 0 || blockedReason !== ''}
            className="flex-1 bg-gold hover:bg-gold-light text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? t('booking.submitting') : t('booking.confirmRequest')}
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
  const { t } = useTranslation()
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(true)
  const [step, setStep] = useState<1 | 2>(1)
  const [profileData, setProfileData] = useState<ProfileFormData | null>(null)
  /*
    The dates live here, not in BookingDatesStep. That step unmounts when the
    customer goes back to edit their details, so entering Oct 1 to Oct 11 and
    returning reset the fields to the defaults without saying so.
  */
  /*
    Seeded from the fleet page when the visitor filtered by dates there, so
    they are not asked for the same thing twice. The values arrive as
    wall-clock ISO strings; the inputs want datetime-local.
  */
  const location = useLocation()
  const carried = (location.state as { pickup?: string; returnDate?: string } | null) ?? null
  const [dates, setDates] = useState<{ pickup: string; returnDate: string } | null>(
    carried?.pickup && carried?.returnDate
      ? {
          pickup: carried.pickup.slice(0, 16),
          returnDate: carried.returnDate.slice(0, 16),
        }
      : null
  )
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
        // Bouncing to / with no message left the customer wondering what
        // they had done wrong.
        if (v.status !== 'available') {
          navigate('/', {
            replace: true,
            state: { notice: t('booking.carUnavailable') },
          })
        } else setVehicle(v)
      })
      .catch(() =>
        navigate('/', {
          replace: true,
          state: { notice: t('booking.carLoadFailed') },
        })
      )
      .finally(() => setLoadingVehicle(false))
  }, [vehicleId, navigate, t])

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
      setError(err instanceof Error ? err.message : t('booking.bookingFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingVehicle || !profile) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-gray-400" role="status">{t('booking.loading')}</div>
      </div>
    )
  }

  if (!vehicle) return null

  const photo = photoUrl(vehicle.photo_front)

  return (
    <div className="min-h-screen bg-dark py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gold transition-colors mb-8 text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('booking.backToFleet')}
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
          {[{ n: 1, label: t('booking.stepInfo') }, { n: 2, label: t('booking.stepDates') }].map(({ n, label }) => (
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
            <p className="text-gray-400 text-sm">{t('booking.vehicleSpec', { type: vehicle.vehicle_type, seats: vehicle.seats, transmission: vehicle.transmission })}</p>
            <p className="text-gold font-semibold mt-1">{t('booking.perDay', { amount: Number(vehicle.daily_rate).toLocaleString() })}</p>
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
            onClearError={() => setError('')}
            initialDates={dates}
            onDatesChange={setDates}
          />
        )}
      </div>
    </div>
  )
}
