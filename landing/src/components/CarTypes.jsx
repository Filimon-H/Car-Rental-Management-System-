const carTypes = [
  {
    id: 1,
    name: 'Luxury Cars',
    image: 'https://ext.same-assets.com/827312978/250598173.jpeg',
  },
  {
    id: 2,
    name: 'Sport Cars',
    image: 'https://ext.same-assets.com/827312978/2838408109.jpeg',
  },
  {
    id: 3,
    name: 'SUV',
    image: 'https://ext.same-assets.com/827312978/90024058.jpeg',
  },
];

export default function CarTypes() {
  return (
    <section className="py-24 bg-[#121212]">
      {/* Section Divider */}
      <div className="section-divider mb-16" />

      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            CATEGORIES
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Rental </span>
            <span className="text-gold">Car Types</span>
          </h2>
        </div>

        {/* Car Types Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {carTypes.map((type) => (
            <div
              key={type.id}
              className="group relative rounded-2xl overflow-hidden h-96 card-hover"
            >
              <img
                src={type.image}
                alt={type.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute top-6 left-6">
                <h3 className="text-2xl font-bold text-white">{type.name}</h3>
              </div>
              <div className="absolute bottom-6 left-6">
                <button
                  className="w-14 h-14 rounded-full border border-gold flex items-center justify-center group-hover:bg-gold transition-colors"
                >
                  <i className="fas fa-arrow-right text-gold group-hover:text-black"></i>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-8">
          <div className="w-3 h-3 rounded-full bg-gold" />
          <div className="w-3 h-3 rounded-full bg-white/30" />
        </div>
      </div>
    </section>
  );
}
