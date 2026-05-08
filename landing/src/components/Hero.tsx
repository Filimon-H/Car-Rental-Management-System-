import { useState, useEffect } from 'react'
import { ChevronRight, Users, Settings, Briefcase } from 'lucide-react'
import { cars } from '../data/cars'

const heroSlides = cars.filter((c) => c.featured).slice(0, 3)

export default function Hero() {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const current = heroSlides[currentSlide]

  return (
    <section className="relative min-h-screen bg-dark-100 pt-20 overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${current.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      </div>

      <div className="relative container mx-auto px-4 lg:px-8 h-[calc(100vh-80px)] flex items-center">
        <div className="grid lg:grid-cols-2 gap-8 items-center w-full">
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gold text-lg">★</span>
              <span className="text-gold text-sm tracking-[0.3em] uppercase">
                {current.category.toUpperCase()}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
              {current.name}
            </h1>
            <div className="flex items-baseline gap-2 mb-8">
              <p className="text-gray-300">Starting from</p>
              <span className="text-gold text-3xl font-bold">
                {current.price.toLocaleString()} ETB
              </span>
              <span className="text-gray-400">/ day</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <a
                href="#cars"
                onClick={(e) => {
                  e.preventDefault()
                  document.querySelector('#cars')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="btn-gold px-8 py-4 rounded-full flex items-center gap-2 font-medium"
              >
                View Fleet
                <ChevronRight className="h-4 w-4" />
              </a>
              <a
                href={`https://wa.me/251911669414`}
                target="_blank"
                rel="noreferrer"
                className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all font-medium"
              >
                Book Now
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="hidden lg:flex justify-end">
            <div className="bg-dark-200/80 backdrop-blur-sm rounded-2xl p-8 w-72">
              <div className="space-y-5">
                {[
                  { icon: <Users className="h-4 w-4 text-gold" />, label: 'Passengers', value: `${current.seats} seats` },
                  { icon: <Settings className="h-4 w-4 text-gold" />, label: 'Transmission', value: current.transmission },
                  { icon: <Briefcase className="h-4 w-4 text-gold" />, label: 'A/C', value: current.ac ? 'Yes' : 'No' },
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
