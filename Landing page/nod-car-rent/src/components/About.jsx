export default function About() {
  return (
    <section id="about" className="py-24 bg-[#1a1a1a]">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div>
            <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
              RENTAX
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              We Are More Than
            </h2>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gold mb-6">
              A Car Rental Company
            </h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Car repair quisque sodales dui ut varius vestibulum drana tortor turpis
              porttiton tellus eu euismod nisl massa nutodio in the miss volume place
              urna lacinia eros nunta urna mauris vehicula rutrum in the miss on volume
              interdum.
            </p>
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border border-gold flex items-center justify-center">
                  <i className="fas fa-check text-gold text-xs"></i>
                </div>
                <span className="text-gray-300">Sports and Luxury Cars</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border border-gold flex items-center justify-center">
                  <i className="fas fa-check text-gold text-xs"></i>
                </div>
                <span className="text-gray-300">Economy Cars</span>
              </li>
            </ul>
            <button className="btn-gold px-8 py-4 rounded-full">
              Read More
            </button>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden">
              <img
                src="https://ext.same-assets.com/827312978/2165923474.jpeg"
                alt="About Renax"
                className="w-full h-auto object-cover"
              />
              {/* Play Button */}
              <a
                href="https://youtu.be/1LxcTt1adfY"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-8 left-8 w-16 h-16 bg-gold rounded-full flex items-center justify-center hover:bg-[#d4af37] transition-colors"
              >
                <i className="fas fa-play text-black"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
