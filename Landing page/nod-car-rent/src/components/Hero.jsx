import { useState, useEffect } from 'react';

const cars = [
  {
    id: 1,
    category: 'Economy',
    name: 'Bugatti Mistral W16',
    price: 750,
    image: 'https://ext.same-assets.com/827312978/3401952982.jpeg',
    specs: { doors: 2, passengers: 4, transmission: 'Auto', luggage: '1 Bag', age: 25 },
  },
  {
    id: 2,
    category: 'Economy',
    name: 'Bentley Bentayga',
    price: 600,
    image: 'https://ext.same-assets.com/827312978/1727984465.jpeg',
    specs: { doors: 4, passengers: 5, transmission: 'Auto', luggage: '2 Bags', age: 25 },
  },
  {
    id: 3,
    category: 'Economy',
    name: 'Rolls Royce Cullinan',
    price: 900,
    image: 'https://ext.same-assets.com/827312978/2437275319.jpeg',
    specs: { doors: 4, passengers: 5, transmission: 'Auto', luggage: '2 Bags', age: 25 },
  },
];

export default function Hero() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % cars.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const currentCar = cars[currentSlide];

  return (
    <section className="relative min-h-screen bg-[#1a1a1a] pt-20 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${currentCar.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
      </div>

      <div className="relative container mx-auto px-4 lg:px-8 h-[calc(100vh-80px)] flex items-center">
        <div className="grid lg:grid-cols-2 gap-8 items-center w-full">
          {/* Left Content */}
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gold text-lg">★</span>
              <span className="text-gold text-sm tracking-[0.3em] uppercase">
                {currentCar.category}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
              {currentCar.name}
            </h1>
            <div className="flex items-baseline gap-2 mb-8">
              <p className="text-gray-300">Reserve now and get the best offer</p>
              <span className="text-gold text-3xl font-bold">${currentCar.price}</span>
              <span className="text-gray-400">/ DAY</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <button className="btn-gold px-8 py-4 rounded-full flex items-center gap-2">
                View Details
                <i className="fas fa-chevron-right text-sm"></i>
              </button>
              <button className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all">
                Rent Now
                <i className="fas fa-chevron-right text-sm"></i>
              </button>
            </div>
          </div>

          {/* Right - Specs Card */}
          <div className="hidden lg:flex justify-end">
            <div className="bg-[#222222]/80 backdrop-blur-sm rounded-2xl p-8 w-80">
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                      <i className="fas fa-car text-gold text-xs"></i>
                    </div>
                    <span className="text-gray-400">Doors</span>
                  </div>
                  <span className="text-white font-semibold">{currentCar.specs.doors}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                      <i className="fas fa-users text-gold text-xs"></i>
                    </div>
                    <span className="text-gray-400">Passengers</span>
                  </div>
                  <span className="text-white font-semibold">{currentCar.specs.passengers}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                      <i className="fas fa-cog text-gold text-xs"></i>
                    </div>
                    <span className="text-gray-400">Transmission</span>
                  </div>
                  <span className="text-white font-semibold">{currentCar.specs.transmission}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                      <i className="fas fa-suitcase text-gold text-xs"></i>
                    </div>
                    <span className="text-gray-400">Luggage</span>
                  </div>
                  <span className="text-white font-semibold">{currentCar.specs.luggage}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gold/20 flex items-center justify-center">
                      <i className="fas fa-id-card text-gold text-xs"></i>
                    </div>
                    <span className="text-gray-400">Age</span>
                  </div>
                  <span className="text-white font-semibold">{currentCar.specs.age}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide Indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
        {cars.map((car, index) => (
          <button
            key={car.id}
            onClick={() => setCurrentSlide(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentSlide ? 'bg-gold' : 'bg-white/50'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
