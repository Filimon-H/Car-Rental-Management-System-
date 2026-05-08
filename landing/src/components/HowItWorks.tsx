const steps = [
  { number: '01', title: 'Choose a Car', description: 'Browse our fleet and pick the vehicle that suits your needs and budget.' },
  { number: '02', title: 'Contact Us', description: 'Reach out via WhatsApp, phone call, or our contact form — we respond fast.' },
  { number: '03', title: 'Confirm & Pay', description: 'We confirm availability and arrange a convenient payment method.' },
  { number: '04', title: 'Pick Up & Drive', description: 'Collect from our office near St. Gabriel Hospital, or we deliver to the airport.' },
]

export default function HowItWorks() {
  return (
    <section className="py-24 bg-dark-100">
      <div className="section-divider mb-16" />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            Simple Process
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">How It </span>
            <span className="text-gold">Works</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative text-center">
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-gold/50 to-transparent" />
              )}
              <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold mb-6">
                <span className="text-gold text-xl font-bold">{step.number}</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
