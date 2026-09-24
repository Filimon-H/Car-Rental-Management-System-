import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, Settings, Wind, Car as CarIcon, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { bookingService, PublicVehicle } from '../services/booking'
import { cars, categories, type Car } from '../data/cars'

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Photo carousel (shared by card and modal)
// ---------------------------------------------------------------------------
function PhotoCarousel({
  photos,
  autoplay = true,
  height = 'h-48',
  grayscale = false,
}: {
  photos: string[]
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
          alt={`photo ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${grayscale ? 'grayscale' : ''} ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}

      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); resetTimer() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); resetTimer() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
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
        className="bg-dark-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal carousel */}
        <div className="group relative rounded-t-2xl overflow-hidden">
          <PhotoCarousel photos={photos} height="h-64" autoplay grayscale={!isAvailable} />
          <button
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
function ApiCarCard({ car, onInspect }: { car: PublicVehicle; onInspect: () => void }) {
  const photos = getPhotos(car)
  const isAvailable = car.status === 'available'
  const badge = STATUS_BADGE[car.status] ?? UNKNOWN_STATUS_BADGE

  return (
    <div
      className={`group bg-dark-200 rounded-2xl overflow-hidden card-hover cursor-pointer ${!isAvailable ? 'opacity-80' : ''}`}
      onClick={onInspect}
    >
      <div className="relative overflow-hidden">
        <PhotoCarousel photos={photos} height="h-48" autoplay grayscale={!isAvailable} />
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
        <h3 className="text-xl font-semibold text-white mb-4">{car.year} {car.make} {car.model}</h3>
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
          <div>
            <span className="text-gold text-2xl font-bold">{Number(car.daily_rate).toLocaleString()}</span>
            <span className="text-gray-400 text-sm ml-1">ETB / day</span>
          </div>
          {isAvailable ? (
            <Link
              to={`/book/${car.id}`}
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
// Static car card (fallback)
// ---------------------------------------------------------------------------
function StaticCarCard({ car }: { car: Car }) {
  return (
    <div className="group bg-dark-200 rounded-2xl overflow-hidden card-hover">
      <div className="relative h-48 overflow-hidden">
        <img
          src={car.image}
          alt={car.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-4 right-4 bg-gold text-white text-xs font-bold px-3 py-1 rounded-full capitalize">
          {car.category}
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-semibold text-white mb-4">{car.name}</h3>
        <div className="flex items-center justify-between text-sm text-gray-400 mb-6">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-gold" />
            <span>{car.seats} seats</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Settings className="h-4 w-4 text-gold" />
            <span>{car.transmission}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wind className="h-4 w-4 text-gold" />
            <span>A/C</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-gold text-2xl font-bold">{car.price.toLocaleString()}</span>
            <span className="text-gray-400 text-sm ml-1">ETB / day</span>
          </div>
          <a
            href={`https://wa.me/251911669414?text=I'm interested in renting the ${car.name}`}
            target="_blank"
            rel="noreferrer"
            className="btn-gold px-5 py-2 rounded-full text-sm font-medium"
          >
            Book Now
          </a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fleet section
// ---------------------------------------------------------------------------
export default function Fleet() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [inspecting, setInspecting] = useState<PublicVehicle | null>(null)

  const { data: apiVehicles } = useQuery({
    queryKey: ['public-vehicles'],
    queryFn: bookingService.getVehicles,
    staleTime: 60_000,
  })

  const useApi = apiVehicles && apiVehicles.length > 0

  const filteredStatic = activeCategory === 'all'
    ? cars
    : cars.filter((c) => c.category === activeCategory)

  const filteredApi = apiVehicles
    ? activeCategory === 'all'
      ? apiVehicles
      : apiVehicles.filter((v) => v.vehicle_type.toLowerCase().includes(activeCategory))
    : []

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
            {useApi && (
              <p className="text-gray-400 text-sm mt-3">Click any car to inspect it</p>
            )}
          </div>

          {!useApi && (
            <div className="flex flex-wrap justify-center gap-3 mb-10">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                    activeCategory === cat.id
                      ? 'bg-gold text-white'
                      : 'border border-gray-600 text-gray-300 hover:border-gold hover:text-gold'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {useApi
              ? filteredApi.map((car) => (
                  <ApiCarCard key={car.id} car={car} onInspect={() => setInspecting(car)} />
                ))
              : filteredStatic.map((car) => <StaticCarCard key={car.name} car={car} />)}
          </div>
        </div>
      </section>

      {inspecting && <CarModal car={inspecting} onClose={() => setInspecting(null)} />}
    </>
  )
}
