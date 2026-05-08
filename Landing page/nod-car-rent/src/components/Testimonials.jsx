export default function Testimonials() {
  const testimonials = [
    {
      id: 1,
      name: 'Olivia Brown',
      role: 'Customer',
      content: 'Lorem posuere in miss drana en the nisan semere sceriun amiss etiam ornare in the miss drana is lorem fermen nunta urnase mauris in the interdum.',
      avatar: 'https://ext.same-assets.com/827312978/925488135.jpeg',
      rating: 5,
    },
    {
      id: 2,
      name: 'Emily Martin',
      role: 'Customer',
      content: 'Lorem posuere in miss drana en the nisan semere sceriun amiss etiam ornare in the miss drana is lorem fermen nunta urnase mauris in the interdum.',
      avatar: 'https://ext.same-assets.com/827312978/2244814234.jpeg',
      rating: 5,
    },
    {
      id: 3,
      name: 'Dan Martin',
      role: 'Customer',
      content: 'Lorem posuere in miss drana en the nisan semere sceriun amiss etiam ornare in the miss drana is lorem fermen nunta urnase mauris in the interdum.',
      avatar: 'https://ext.same-assets.com/827312978/2266421130.jpeg',
      rating: 5,
    },
  ];

  return (
    <section className="py-24 bg-[#121212]">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            TESTIMONIALS
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white">
            What Clients Say
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-[#222222] rounded-2xl p-8 card-hover"
            >
              {/* Rating and Quote */}
              <div className="flex items-start justify-between mb-6">
                <div className="text-gold text-5xl font-serif">"</div>
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <i key={i} className="fas fa-star text-gold text-sm"></i>
                  ))}
                </div>
              </div>

              {/* Content */}
              <p className="text-gray-400 text-sm leading-relaxed mb-8">
                {testimonial.content}
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-white font-semibold">{testimonial.name}</h4>
                  <p className="text-gray-400 text-sm">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
