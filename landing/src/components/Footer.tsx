import { Phone, Mail, MapPin, Car, Send } from 'lucide-react'
import { contactInfo } from '../data/cars'

const quickLinks = [
  { name: 'About', href: '#about' },
  { name: 'Services', href: '#services' },
  { name: 'Our Fleet', href: '#cars' },
  { name: 'Contact', href: '#contact' },
]

export default function Footer() {
  return (
    <footer className="bg-dark pt-16 pb-8">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: <Phone className="h-5 w-5 text-black" />, label: 'Call us', value: contactInfo.phones[0] },
            { icon: <Mail className="h-5 w-5 text-black" />, label: 'Write to us', value: contactInfo.email },
            { icon: <MapPin className="h-5 w-5 text-black" />, label: 'Address', value: contactInfo.address.city },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-4 bg-dark-200 rounded-2xl p-6">
              <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
              <div>
                <h4 className="text-white font-semibold text-sm">{label}</h4>
                <p className="text-gray-400 text-sm">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <a href="#" className="flex items-center gap-2 mb-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold">
                <Car className="h-4 w-4 text-black" />
              </div>
              <span className="text-lg font-bold">
                <span className="text-white">Nod</span>
                <span className="text-gold"> Car Rent</span>
              </span>
            </a>
            <p className="text-gray-400 text-sm leading-relaxed">
              Reliable car rentals in Addis Ababa. Self-drive, driver-included, and airport transfers available.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-5">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-gray-400 hover:text-gold transition-colors flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-5">Newsletter</h3>
            <p className="text-gray-400 text-sm mb-4">Get notified about new vehicles and offers.</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email address"
                className="flex-1 bg-dark-200 border border-gray-700 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
              />
              <button className="w-10 h-10 rounded-full bg-gold flex items-center justify-center hover:bg-gold-light transition-colors flex-shrink-0">
                <Send className="h-4 w-4 text-black" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Nod Car Rent. All rights reserved.
          </p>
          <a
            href="/login"
            className="text-gray-600 hover:text-gold text-xs transition-colors"
          >
            Staff Login →
          </a>
        </div>
      </div>
    </footer>
  )
}
