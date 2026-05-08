const brands = [
  { name: 'Lamborghini', logo: 'https://ext.same-assets.com/827312978/4005394627.png' },
  { name: 'Rolls Royce', logo: 'https://ext.same-assets.com/827312978/2350247452.png' },
  { name: 'Porsche', logo: 'https://ext.same-assets.com/827312978/1025977264.png' },
  { name: 'Maserati', logo: 'https://ext.same-assets.com/827312978/4026813600.png' },
  { name: 'Land Rover', logo: 'https://ext.same-assets.com/827312978/1838546022.png' },
  { name: 'Mini', logo: 'https://ext.same-assets.com/827312978/465124206.png' },
];

export default function BrandLogos() {
  return (
    <section className="py-16 bg-[#2a2a2a] border-t border-b border-gray-800">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          {brands.map((brand) => (
            <div
              key={brand.name}
              className="opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
            >
              <img
                src={brand.logo}
                alt={brand.name}
                className="h-12 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
