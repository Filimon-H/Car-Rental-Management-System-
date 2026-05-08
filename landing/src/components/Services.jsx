export default function Services() {
  const services = [
    {
      id: 1,
      number: '01',
      title: 'Corporate Car Rental',
      image: 'https://ext.same-assets.com/827312978/1306870332.jpeg',
    },
    {
      id: 2,
      number: '02',
      title: 'Car Rental with Driver',
      image: 'https://ext.same-assets.com/827312978/2738082989.jpeg',
    },
    {
      id: 3,
      number: '03',
      title: 'Airport Transfer',
      image: 'https://ext.same-assets.com/827312978/121554982.jpeg',
    },
  ];

  return (
    <section id="services" className="py-24 bg-[#121212]">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            WHAT WE DO
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Our </span>
            <span className="text-gold">Services</span>
          </h2>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.id}
              className="group relative rounded-2xl overflow-hidden h-80 card-hover"
            >
              <img
                src={service.image}
                alt={service.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{service.title}</h3>
                  </div>
                  <div className="w-12 h-12 rounded-full border border-gold flex items-center justify-center group-hover:bg-gold transition-colors">
                    <span className="text-gold text-sm group-hover:text-black">{service.number}</span>
                  </div>
                </div>
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
