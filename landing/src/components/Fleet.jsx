import { useRef } from 'react';

const cars = [
  {
    id: 1,
    name: 'Rolls Royce Cullinan',
    seats: 4,
    transmission: 'Auto',
    bags: 4,
    age: 25,
    price: 900,
    image: 'https://ext.same-assets.com/827312978/2437275319.jpeg',
  },
  {
    id: 2,
    name: 'Bentley Continental',
    seats: 4,
    transmission: 'Auto',
    bags: 2,
    age: 25,
    price: 500,
    image: 'https://ext.same-assets.com/827312978/1727984465.jpeg',
  },
  {
    id: 3,
    name: 'Audi RS7 Sportback',
    seats: 4,
    transmission: 'Auto',
    bags: 2,
    age: 25,
    price: 450,
    image: 'https://ext.same-assets.com/827312978/615778102.jpeg',
  },
  {
    id: 4,
    name: 'AUDI Q8',
    seats: 4,
    transmission: 'Auto',
    bags: 3,
    age: 25,
    price: 450,
    image: 'https://ext.same-assets.com/827312978/2693220535.jpeg',
  },
  {
    id: 5,
    name: 'Lamborghini Urus',
    seats: 4,
    transmission: 'Auto',
    bags: 2,
    age: 25,
    price: 750,
    image: 'https://ext.same-assets.com/827312978/1474704332.jpeg',
  },
  {
    id: 6,
    name: 'Bugatti Mistral W16',
    seats: 2,
    transmission: 'Auto',
    bags: 2,
    age: 25,
    price: 800,
    image: 'https://ext.same-assets.com/827312978/3401952982.jpeg',
  },
];

export default function CarFleet() {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section id="cars" className="py-24 bg-[#1a1a1a]">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            SELECT YOUR CAR
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Luxury </span>
            <span className="text-gold">Car Fleet</span>
          </h2>
        </div>

        {/* Cars Carousel */}
        <div className="relative">
          {/* Navigation Buttons */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-[#2a2a2a] rounded-full flex items-center justify-center hover:bg-gold transition-colors group"
          >
            <i className="fas fa-chevron-left text-white group-hover:text-black"></i>
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-[#2a2a2a] rounded-full flex items-center justify-center hover:bg-gold transition-colors group"
          >
            <i className="fas fa-chevron-right text-white group-hover:text-black"></i>
          </button>

          {/* Cars Container */}
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto hide-scrollbar px-16"
          >
            {cars.map((car) => (
              <div
                key={car.id}
                className="flex-shrink-0 w-[350px] bg-[#222222] rounded-2xl overflow-hidden card-hover"
              >
                <div className="relative h-48">
                  <img
                    src={car.image}
                    alt={car.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-white mb-3">{car.name}</h3>
                  <div className="flex flex-wrap gap-4 text-gray-400 text-sm mb-4">
                    <span>{car.seats} Seats</span>
                    <span>{car.transmission}</span>
                    <span>{car.bags} Bags</span>
                    <span>Age {car.age}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <button className="btn-gold px-6 py-2 rounded-full text-sm">
                      Details
                    </button>
                    <div className="text-right">
                      <span className="text-gold text-2xl font-bold">${car.price}</span>
                      <span className="text-gray-400 text-sm">/day</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
