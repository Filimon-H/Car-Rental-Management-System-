export default function Contact() {
  return (
    <section id="contact" className="bg-[#1a1a1a] py-24">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16">
          {/* Left - CTA */}
          <div className="relative">
            {/* Background Image */}
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0c0c0c] to-transparent"></div>
            </div>

            {/* Content */}
            <div className="relative p-12 lg:p-16">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-px bg-[#c4a053]"></div>
                <span className="text-[#c4a053] text-sm uppercase tracking-widest">Rent Your Car</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                Interested in Renting?
              </h2>

              <p className="text-white/60 mb-8">
                Don't hesitate and send us a message.
              </p>

              <div className="flex flex-wrap gap-4">
                <a
                  href="https://wa.me/8551004444"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 text-white px-8 py-4 uppercase tracking-wider text-sm font-medium hover:bg-green-600 transition-all flex items-center gap-3"
                >
                  <i className="fab fa-whatsapp text-xl"></i>
                  WhatsApp
                </a>
                <a
                  href="#fleet"
                  className="btn-gold px-8 py-4 uppercase tracking-wider text-sm"
                >
                  Rent Now
                </a>
              </div>
            </div>
          </div>

          {/* Right - Contact Info */}
          <div className="space-y-8">
            {/* Contact Cards */}
            <div className="grid gap-6">
              {/* Phone */}
              <div className="bg-[#0c0c0c] p-6 border border-white/10 flex items-center gap-6 group hover:border-[#c4a053] transition-all">
                <div className="w-16 h-16 border border-[#c4a053] flex items-center justify-center group-hover:bg-[#c4a053] transition-all">
                  <i className="fas fa-phone text-[#c4a053] text-xl group-hover:text-[#0c0c0c] transition-colors"></i>
                </div>
                <div>
                  <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Call us</p>
                  <a href="tel:+97152333444" className="text-white text-xl font-semibold hover:text-[#c4a053] transition-colors">
                    +971 52-333-4444
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="bg-[#0c0c0c] p-6 border border-white/10 flex items-center gap-6 group hover:border-[#c4a053] transition-all">
                <div className="w-16 h-16 border border-[#c4a053] flex items-center justify-center group-hover:bg-[#c4a053] transition-all">
                  <i className="fas fa-envelope text-[#c4a053] text-xl group-hover:text-[#0c0c0c] transition-colors"></i>
                </div>
                <div>
                  <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Write to us</p>
                  <a href="mailto:info@renax.com" className="text-white text-xl font-semibold hover:text-[#c4a053] transition-colors">
                    info@renax.com
                  </a>
                </div>
              </div>

              {/* Address */}
              <div className="bg-[#0c0c0c] p-6 border border-white/10 flex items-center gap-6 group hover:border-[#c4a053] transition-all">
                <div className="w-16 h-16 border border-[#c4a053] flex items-center justify-center group-hover:bg-[#c4a053] transition-all">
                  <i className="fas fa-map-marker-alt text-[#c4a053] text-xl group-hover:text-[#0c0c0c] transition-colors"></i>
                </div>
                <div>
                  <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Address</p>
                  <p className="text-white text-xl font-semibold">
                    Dubai, Water Tower, Office 123
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-white/50 leading-relaxed">
              Rent a car imperdiet sapien porttito the bibenum ellentesue the commodo erat nesuen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
