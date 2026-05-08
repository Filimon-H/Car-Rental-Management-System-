export default function Process() {
  const steps = [
    {
      id: 1,
      number: '01',
      title: 'Choose A Car',
      description: 'View our range of cars, find your perfect car for the coming days.',
    },
    {
      id: 2,
      number: '02',
      title: 'Come In Contact',
      description: 'Our advisor team is ready to help you with the booking process or any questions.',
    },
    {
      id: 3,
      number: '03',
      title: 'Enjoy Driving',
      description: 'Receive the key and enjoy your car. We treat all our cars with respect.',
    },
  ];

  return (
    <section className="py-24 bg-[#1a1a1a]">
      {/* Section Divider */}
      <div className="section-divider mb-16" />

      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            STEPS
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Car Rental </span>
            <span className="text-gold">Process</span>
          </h2>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {steps.map((step) => (
            <div
              key={step.id}
              className="bg-[#222222] rounded-2xl p-8 relative card-hover"
            >
              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-16">
                {step.description}
              </p>
              <div className="absolute bottom-8 left-8 w-12 h-12 rounded-full border border-gold/30 flex items-center justify-center">
                <span className="text-gold text-sm font-semibold">{step.number}.</span>
              </div>
            </div>
          ))}
        </div>

        {/* Help Note */}
        <div className="flex items-center justify-center gap-3 text-gray-400">
          <i className="fas fa-info-circle text-gold"></i>
          <p>If you've never rented a car before, we'll guide you through the process.</p>
        </div>
      </div>
    </section>
  );
}
