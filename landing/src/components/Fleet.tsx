import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, Settings, Wind, Car as CarIcon, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { bookingService, PublicVehicle } from '../services/booking'
import { contactInfo } from '../data/cars'

import { uploadsUrl } from '../services/apiClient'

function photoUrl(path: string | null): string | null {
  if (!path) return null
  return uploadsUrl(path) || ''
}

function getPhotos(car: PublicVehicle): string[] {
  return [car.photo_front, car.photo_back, car.photo_left, car.photo_right]
    .filter(Boolean)
    .map((p) => photoUrl(p)!)
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' },
  reserved:  { label: 'Reserved',  cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  rented:    { label: 'Rented',    cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
}

/**
 * Badge for a status the map does not know.
 *
 * This fell back to the "Available" badge, so a vehicle the API reported as
 * inactive showed a green Available badge beside a disabled "Unavailable"
 * button — the card contradicted itself. Anything unrecognised is now
 * presented as not bookable, which is what isAvailable already decides.
 */
const UNKNOWN_STATUS_BADGE = {
  label: 'Unavailable',
  cls: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

/** The visible name of a vehicle, reused for alt text and control labels. */
function carName(car: PublicVehicle): string {
  return `${car.year} ${car.make} ${car.model}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Photo carousel (shared by card and modal)
// ---------------------------------------------------------------------------
function PhotoCarousel({
  photos,
  label,
  autoplay = true,
  height = 'h-48',
  grayscale = false,
}: {
  photos: string[]
  /** The vehicle these photos belong to, for alt text and control labels. */
  label: string
  autoplay?: boolean
  height?: string
  grayscale?: boolean
}) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const next = useCallback(() => setIndex((i) => (i + 1) % Math.max(photos.length, 1)), [photos.length])
  const prev = useCallback(() => setIndex((i) => (i - 1 + Math.max(photos.length, 1)) % Math.max(photos.length, 1)), [photos.length])

  useEffect(() => {
    if (!autoplay || photos.length <= 1) return
    timerRef.current = setInterval(next, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoplay, photos.length, next])

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoplay && photos.length > 1) timerRef.current = setInterval(next, 3000)
  }

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); resetTimer() }
    touchStartX.current = null
  }

  if (photos.length === 0) {
    return (
      <div className={`${height} bg-dark-300 flex items-center justify-center`}>
        <CarIcon className="h-16 w-16 text-gray-600" />
      </div>
    )
  }

  return (
    <div
      className={`relative ${height} overflow-hidden select-none`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {photos.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={`${label} — photo ${i + 1} of ${photos.length}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${grayscale ? 'grayscale' : ''} ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}

      {photos.length > 1 && (
        <>
          {/*
            These had no text, no aria-label and no title, so a screen reader
            announced 26 of the page's 34 buttons as just "button". The hero
            slider already labelled its dots; the pattern simply was not
            applied here. focus-visible also keeps them reachable by keyboard,
            since they are otherwise revealed only on hover.
          */}
          <button
            type="button"
            aria-label={`Previous photo of ${label}`}
            onClick={(e) => { e.stopPropagation(); prev(); resetTimer() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Next photo of ${label}`}
            onClick={(e) => { e.stopPropagation(); next(); resetTimer() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show photo ${i + 1} of ${photos.length} of ${label}`}
                aria-current={i === index}
                onClick={(e) => { e.stopPropagation(); setIndex(i); resetTimer() }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? 'bg-gold w-3' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Car detail modal
// ---------------------------------------------------------------------------
function CarModal({ car, onClose }: { car: PublicVehicle; onClose: () => void }) {
  const photos = getPhotos(car)
  const isAvailable = car.status === 'available'
  const badge = STATUS_BADGE[car.status] ?? UNKNOWN_STATUS_BADGE

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={carName(car)}
        className="bg-dark-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal carousel */}
        <div className="group relative rounded-t-2xl overflow-hidden">
          <PhotoCarousel photos={photos} label={carName(car)} height="h-64" autoplay grayscale={!isAvailable} />
          <button
            type="button"
            aria-label={`Close details for ${carName(car)}`}
            onClick={onClose}
            className="absolute top-3 right-3 bg-black/60 hover:bg-black/90 text-white rounded-full p-1.5 z-10"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute top-3 left-3 z-10">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-1">
            {car.year} {car.make} {car.model}
          </h2>
          <p className="text-gray-400 text-sm mb-5 capitalize">{car.vehicle_type} · {car.color}</p>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-dark-300 rounded-xl p-3 text-center">
              <Users className="h-5 w-5 text-gold mx-auto mb-1" />
              <p className="text-white text-sm font-medium">{car.seats}</p>
              <p className="text-gray-500 text-xs">Seats</p>
            </div>
            <div className="bg-dark-300 rounded-xl p-3 text-center">
              <Settings className="h-5 w-5 text-gold mx-auto mb-1" />
              <p className="text-white text-sm font-medium capitalize">{car.transmission || 'Auto'}</p>
              <p className="text-gray-500 text-xs">Gearbox</p>
            </div>
            <div className="bg-dark-300 rounded-xl p-3 text-center">
              <Wind className="h-5 w-5 text-gold mx-auto mb-1" />
              <p className="text-white text-sm font-medium">Yes</p>
              <p className="text-gray-500 text-xs">A/C</p>
            </div>
          </div>

          {!isAvailable && car.available_from && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-5">
              <Calendar className="h-4 w-4 text-yellow-400 shrink-0" />
              <p className="text-yellow-300 text-sm">
                Available from <span className="font-semibold">{formatDate(car.available_from)}</span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <span className="text-gold text-3xl font-bold">{Number(car.daily_rate).toLocaleString()}</span>
              <span className="text-gray-400 text-sm ml-1">ETB / day</span>
            </div>
            {isAvailable ? (
              <Link
                to={`/book/${car.id}`}
                onClick={onClose}
                className="btn-gold px-6 py-2.5 rounded-full text-sm font-semibold"
              >
                Book Now
              </Link>
            ) : (
              <span className="px-6 py-2.5 rounded-full text-sm font-medium border border-gray-600 text-gray-500 cursor-not-allowed">
                Unavailable
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// API car card
// ---------------------------------------------------------------------------
function ApiCarCard({
  car,
  onInspect,
  dates,
}: {
  car: PublicVehicle
  onInspect: () => void
  /** Dates the visitor already chose, so the booking page opens with them. */
  dates?: { pickup: string; returnDate: string } | null
}) {
  const photos = getPhotos(car)
  const isAvailable = car.status === 'available'
  const badge = STATUS_BADGE[car.status] ?? UNKNOWN_STATUS_BADGE

  return (
    <div
      className={`group bg-dark-200 rounded-2xl overflow-hidden card-hover cursor-pointer ${!isAvailable ? 'opacity-80' : ''}`}
      onClick={onInspect}
    >
      <div className="relative overflow-hidden">
        <PhotoCarousel photos={photos} label={carName(car)} height="h-48" autoplay grayscale={!isAvailable} />
        <div className="absolute top-4 left-4 z-10">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <div className="absolute top-4 right-4 z-10 bg-gold text-white text-xs font-bold px-3 py-1 rounded-full capitalize">
          {car.vehicle_type}
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-semibold text-white mb-4">{carName(car)}</h3>
        <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-gold" />
            <span>{car.seats} seats</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Settings className="h-4 w-4 text-gold" />
            <span>{car.transmission || 'Automatic'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wind className="h-4 w-4 text-gold" />
            <span>A/C</span>
          </div>
        </div>
        {!isAvailable && car.available_from && (
          <p className="text-xs text-gray-400 mb-4">
            Available from <span className="text-gold font-medium">{formatDate(car.available_from)}</span>
          </p>
        )}
        <div className="flex items-center justify-between">
          {/*
            On a date-filtered search the card shows what the whole rental
            costs, with any weekly or monthly tier already applied — the
            same figure the booking page quotes and the agreement charges.
          */}
          {car.quoted_total ? (
            <div>
              <span className="text-gold text-2xl font-bold">
                {Number(car.quoted_total).toLocaleString()}
              </span>
              <span className="text-gray-400 text-sm ml-1">
                ETB for {car.quoted_days} day{car.quoted_days === 1 ? '' : 's'}
              </span>
              {car.pricing_note === 'Best weekly/monthly tier applied' && (
                <p className="text-gray-500 text-xs mt-0.5">{car.pricing_note}</p>
              )}
            </div>
          ) : (
            <div>
              <span className="text-gold text-2xl font-bold">{Number(car.daily_rate).toLocaleString()}</span>
              <span className="text-gray-400 text-sm ml-1">ETB / day</span>
            </div>
          )}
          {isAvailable ? (
            <Link
              to={`/book/${car.id}`}
              state={dates ?? undefined}
              onClick={(e) => e.stopPropagation()}
              className="btn-gold px-5 py-2 rounded-full text-sm font-medium"
            >
              Book Now
            </Link>
          ) : (
            <span className="px-5 py-2 rounded-full text-sm font-medium border border-gray-600 text-gray-500 cursor-not-allowed">
              Unavailable
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fleet section
// ---------------------------------------------------------------------------
/** Tomorrow at 09:00, as a date input value. */
function defaultPickup(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function Fleet() {
  const [activeCategory] = useState('all')
  const [inspecting, setInspecting] = useState<PublicVehicle | null>(null)

  /*
    Dates before cars.
    
    The browse page listed the whole fleet, so a customer chose a car and
    only discovered at submit that it was not free for their dates. The
    Telegram bot already asks when before what; this brings the website into
    line. Dates are optional: with none set this is the plain browse.
  */
  const [pickup, setPickup] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [applied, setApplied] = useState<{ pickup: string; returnDate: string } | null>(null)
  const [dateError, setDateError] = useState('')

  const minPickup = defaultPickup()

  function applyDates(e: React.FormEvent) {
    e.preventDefault()
    if (!pickup || !returnDate) {
      setDateError('Pick both a start and an end date.')
      return
    }
    if (new Date(returnDate) <= new Date(pickup)) {
      setDateError('The return date must be after the pickup date.')
      return
    }
    setDateError('')
    setApplied({
      pickup: `${pickup}T09:00:00`,
      returnDate: `${returnDate}T09:00:00`,
    })
  }

  function clearDates() {
    setPickup('')
    setReturnDate('')
    setApplied(null)
    setDateError('')
  }

  /**
   * The real fleet, or an honest empty state.
   *
   * This used to fall back to the demo `cars` array whenever the API failed
   * or returned nothing, silently advertising six vehicles the company does
   * not own — a Land Cruiser, a 12-seat Hiace, a Hyundai Accent — at invented
   * prices, with no hint to the visitor that the list was fiction. Showing
   * nothing is better than showing a fleet that cannot be rented.
   */
  const { data: apiVehicles, isLoading, isError, refetch } = useQuery({
    queryKey: ['public-vehicles', applied?.pickup ?? '', applied?.returnDate ?? ''],
    queryFn: () => bookingService.getVehicles(applied ?? undefined),
    staleTime: 60_000,
  })

  const vehicles = apiVehicles ?? []
  const filteredApi =
    activeCategory === 'all'
      ? vehicles
      : vehicles.filter((v) => v.vehicle_type.toLowerCase().includes(activeCategory))

  return (
    <>
      <section id="cars" className="py-24 bg-dark">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">Our Fleet</span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
              <span className="text-white">Choose Your </span>
              <span className="text-gold">Vehicle</span>
            </h2>
            {filteredApi.length > 0 && (
              <p className="text-gray-400 text-sm mt-3">
                {applied
                  ? 'Every car below is free for your dates'
                  : 'Click any car to inspect it'}
              </p>
            )}
          </div>

          {/*
            Choosing dates here filters the list to cars that can actually
            be booked, and prices each one for that rental.
          */}
          <form
            onSubmit={applyDates}
            className="bg-dark-200 rounded-2xl p-5 mb-10 flex flex-col sm:flex-row gap-4 sm:items-end justify-center"
          >
            <div>
              <label htmlFor="fleet-pickup" className="block text-gray-400 text-xs mb-1.5">
                Pickup date
              </label>
              <input
                id="fleet-pickup"
                type="date"
                min={minPickup}
                value={pickup}
                onChange={(e) => { setPickup(e.target.value); setDateError('') }}
                className="bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold [color-scheme:dark]"
              />
            </div>
            <div>
              <label htmlFor="fleet-return" className="block text-gray-400 text-xs mb-1.5">
                Return date
              </label>
              <input
                id="fleet-return"
                type="date"
                min={pickup || minPickup}
                value={returnDate}
                onChange={(e) => { setReturnDate(e.target.value); setDateError('') }}
                className="bg-dark-300 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold [color-scheme:dark]"
              />
            </div>
            <button
              type="submit"
              className="btn-gold-filled px-6 py-2.5 rounded-lg text-sm font-semibold"
            >
              Show available cars
            </button>
            {applied && (
              <button
                type="button"
                onClick={clearDates}
                className="text-gray-400 hover:text-white text-sm px-3 py-2.5 transition-colors"
              >
                Clear dates
              </button>
            )}
          </form>

          {dateError && (
            <p role="alert" className="text-amber-400 text-sm text-center -mt-6 mb-8">
              {dateError}
            </p>
          )}

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-dark-200 rounded-2xl h-80 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div role="alert" className="bg-dark-200 rounded-2xl p-10 text-center">
              <p className="text-white font-semibold mb-2">We couldn't load the fleet</p>
              <p className="text-gray-400 text-sm mb-6">
                Please try again, or call us on {contactInfo.phones[0]} and we'll check
                availability for you.
              </p>
              <button
                onClick={() => refetch()}
                className="border border-gold text-gold hover:bg-gold hover:text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          ) : filteredApi.length === 0 ? (
            <div className="bg-dark-200 rounded-2xl p-10 text-center">
              <p className="text-white font-semibold mb-2">
                {applied
                  ? 'No cars are free for those dates'
                  : 'No vehicles listed right now'}
              </p>
              <p className="text-gray-400 text-sm">
                {applied
                  ? `Try different dates, or call us on ${contactInfo.phones[0]} and we'll help.`
                  : `Call us on ${contactInfo.phones[0]} and we'll find you a car.`}
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApi.map((car) => (
                <ApiCarCard
                  key={car.id}
                  car={car}
                  dates={applied}
                  onInspect={() => setInspecting(car)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {inspecting && <CarModal car={inspecting} onClose={() => setInspecting(null)} />}
    </>
  )
}
