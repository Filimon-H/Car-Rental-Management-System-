import { useState } from 'react'
import { Users, Settings, Wind } from 'lucide-react'
import { cars, categories, type Car } from '../data/cars'

function CarCard({ car }: { car: Car }) {
  return (
    <div className="group bg-dark-200 rounded-2xl overflow-hidden card-hover">
      <div className="relative h-48 overflow-hidden">
        <img
          src={car.image}
          alt={car.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-4 right-4 bg-gold text-black text-xs font-bold px-3 py-1 rounded-full capitalize">
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
            <span className="text-gold text-2xl font-bold">
              {car.price.toLocaleString()}
            </span>
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

export default function Fleet() {
  const [activeCategory, setActiveCategory] = useState('all')

  const filtered = activeCategory === 'all'
    ? cars
    : cars.filter((c) => c.category === activeCategory)

  return (
    <section id="cars" className="py-24 bg-dark">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            Our Fleet
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Choose Your </span>
            <span className="text-gold">Vehicle</span>
          </h2>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-gold text-black'
                  : 'border border-gray-600 text-gray-300 hover:border-gold hover:text-gold'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      </div>
    </section>
  )
}
