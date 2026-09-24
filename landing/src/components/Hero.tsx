import { useState, useEffect } from 'react'
import { Clock, Shield, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cars } from '../data/cars'

/**
 * Slides supply the backdrop only.
 *
 * The spec card here used to read seats/transmission/A-C off these entries,
 * which are demo data: it advertised a 7-seat Mercedes and a 12-seat minivan
 * that are not in the fleet, and every real vehicle is a 5-seat Toyota. A
 * visitor was shown a capacity the company cannot supply. Driving it from
 * /api/public/vehicles is the better answer, but not yet — no vehicle has a
 * photo and the names are still placeholders ("New Car2"), so the card would
 * be accurate and unusable. Until then it makes no per-vehicle claim.
 */
const heroSlides = cars.filter((c) => c.featured).slice(0, 3)

export default function Hero() {
  const { t } = useTranslation()
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const current = heroSlides[currentSlide]

  const scrollToCars = () => {
    document.querySelector('#cars')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-screen bg-dark-100 pt-28 overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${current.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      </div>

      <div className="relative container mx-auto px-4 lg:px-8 h-[calc(100vh-80px)] flex items-center">
        <div className="grid lg:grid-cols-2 gap-8 items-center w-full">
          <div className="max-w-3xl animate-fade-in-up">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              {t('hero.title1')} <span className="text-gold block mt-2">{t('hero.title2')}</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <button
                onClick={scrollToCars}
                className="bg-gold hover:bg-gold-light text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors"
              >
                {t('hero.bookNow')}
              </button>
              <button
                onClick={scrollToCars}
                className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20 px-8 py-4 rounded-lg font-bold text-lg transition-colors"
              >
                {t('hero.viewFleet')}
              </button>
            </div>
          </div>

          <div className="hidden lg:flex justify-end">
            <div className="bg-dark-200/80 backdrop-blur-sm rounded-2xl p-8 w-72">
              <div className="space-y-5">
                {[
                  { icon: <Shield className="h-4 w-4 text-gold" />, label: t('hero.insured'), value: t('hero.insuredValue') },
                  { icon: <Clock className="h-4 w-4 text-gold" />, label: t('hero.support'), value: t('hero.supportValue') },
                  { icon: <MapPin className="h-4 w-4 text-gold" />, label: t('hero.delivery'), value: t('hero.deliveryValue') },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between border-b border-gray-700 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                        {icon}
                      </div>
                      <span className="text-gray-400 text-sm">{label}</span>
                    </div>
                    <span className="text-white font-semibold text-sm">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
        {heroSlides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentSlide ? 'bg-gold' : 'bg-white/50'
            }`}
            aria-label={`Slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
