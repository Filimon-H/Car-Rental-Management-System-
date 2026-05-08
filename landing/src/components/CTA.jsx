export default function CTA() {
  return (
    <section id="contact" className="py-24 bg-[#222222]">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            RENT YOUR CAR
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Interested in Renting?
          </h2>
          <p className="text-gray-400 mb-8">
            Don't hesitate and send us a message.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              className="btn-gold px-8 py-4 rounded-full font-medium"
            >
              WhatsApp
            </button>
            <button
              className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-full font-medium hover:bg-white/20 transition-all"
            >
              Rent Now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
