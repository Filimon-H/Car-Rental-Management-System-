import { Check } from 'lucide-react'

const highlights = [
  'Airport pickup & drop-off available',
  'Well-maintained, regularly serviced fleet',
  'Flexible rental periods — daily, weekly, monthly',
  'Transparent pricing with no hidden fees',
]

export default function About() {
  return (
    <section id="about" className="py-24 bg-dark-100">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
              About Us
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              More Than Just
            </h2>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gold mb-6">
              A Car Rental Company
            </h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Nod Car Rent has been serving customers in Addis Ababa since our founding,
              offering reliable, affordable vehicles for business travel, airport transfers,
              family trips, and long-term rentals. Located near St. Gabriel Hospital, we pride
              ourselves on fast response times and honest pricing.
            </p>
            <ul className="space-y-4 mb-8">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border border-gold flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3 text-gold" />
                  </div>
                  <span className="text-gray-300">{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault()
                document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="btn-gold-filled px-8 py-4 rounded-full font-medium inline-block"
            >
              Contact Us
            </a>
          </div>

          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&q=80&w=800"
              alt="Nod Car Rent fleet"
              className="rounded-2xl w-full object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-gold rounded-2xl p-6 hidden lg:block">
              <p className="text-black text-3xl font-bold">5+</p>
              <p className="text-black text-sm font-medium">Years of Service</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
