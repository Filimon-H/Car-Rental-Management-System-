export default function BookingForm() {
  return (
    <section className="py-16 bg-[#222222]">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            RENT NOW
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Book Auto Rental
          </h2>
        </div>

        {/* Booking Form */}
        <div className="bg-[#2a2a2a] rounded-2xl p-6 lg:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Car Type */}
            <div className="relative">
              <label className="text-gray-400 text-sm mb-2 block">Choose Car Type</label>
              <div className="flex items-center justify-between bg-transparent border border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-gold transition-colors">
                <span className="text-gray-300">Choose Car Type</span>
                <i className="fas fa-chevron-down text-gray-400 text-sm"></i>
              </div>
            </div>

            {/* Pick Up Location */}
            <div className="relative">
              <label className="text-gray-400 text-sm mb-2 block">Pick Up Location</label>
              <div className="flex items-center justify-between bg-transparent border border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-gold transition-colors">
                <span className="text-gray-300">Pick Up Location</span>
                <i className="fas fa-chevron-down text-gray-400 text-sm"></i>
              </div>
            </div>

            {/* Pick Up Date */}
            <div className="relative">
              <label className="text-gray-400 text-sm mb-2 block">Pick Up Date</label>
              <div className="flex items-center justify-between bg-transparent border border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-gold transition-colors">
                <span className="text-gray-300">Pick Up Date</span>
                <i className="fas fa-calendar text-gold text-sm"></i>
              </div>
            </div>

            {/* Drop Off Location */}
            <div className="relative">
              <label className="text-gray-400 text-sm mb-2 block">Drop Off Location</label>
              <div className="flex items-center justify-between bg-transparent border border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-gold transition-colors">
                <span className="text-gray-300">Drop Off Location</span>
                <i className="fas fa-chevron-down text-gray-400 text-sm"></i>
              </div>
            </div>

            {/* Return Date */}
            <div className="relative">
              <label className="text-gray-400 text-sm mb-2 block">Return Date</label>
              <div className="flex items-center justify-between bg-transparent border border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-gold transition-colors">
                <span className="text-gray-300">Return Date</span>
                <i className="fas fa-calendar text-gold text-sm"></i>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-end">
              <button
                type="button"
                className="w-full bg-gold text-black font-semibold py-4 rounded-full hover:bg-[#d4af37] transition-colors"
              >
                Rent Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
