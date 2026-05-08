export default function VideoSection() {
  return (
    <section className="py-24 bg-[#222222]">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            EXPLORE
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Car </span>
            <span className="text-gold">Promo </span>
            <span className="text-white">Video</span>
          </h2>
        </div>

        {/* Video Play Button */}
        <div className="flex justify-center">
          <a
            href="https://youtu.be/1LxcTt1adfY"
            target="_blank"
            rel="noopener noreferrer"
            className="w-20 h-20 bg-transparent border-2 border-white/30 rounded-full flex items-center justify-center hover:border-gold hover:bg-gold group transition-all duration-300"
          >
            <i className="fas fa-play text-white group-hover:text-black text-xl"></i>
          </a>
        </div>
      </div>
    </section>
  );
}
