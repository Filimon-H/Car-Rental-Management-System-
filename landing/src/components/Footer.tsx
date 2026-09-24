import { Phone, Mail, MapPin, Send } from 'lucide-react'
import { contactInfo, telHref } from '../data/cars'
import { TELEGRAM_BOT_URL, TELEGRAM_BOT_USERNAME } from '../services/apiClient'
import { STAFF_LOGIN_URL } from '../services/apiClient'



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
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {[
            { icon: <Phone className="h-5 w-5 text-white" />, label: 'Call us', value: contactInfo.phones[0], href: telHref(contactInfo.phones[0]) },
            { icon: <Mail className="h-5 w-5 text-white" />, label: 'Write to us', value: contactInfo.email, href: `mailto:${contactInfo.email}` },
            { icon: <MapPin className="h-5 w-5 text-white" />, label: 'Address', value: contactInfo.address.city, href: undefined },
            { icon: <Send className="h-5 w-5 text-white" />, label: 'Telegram bot', value: `@${TELEGRAM_BOT_USERNAME}`, href: TELEGRAM_BOT_URL },
          ].map(({ icon, label, value, href }) => {
            const content = (
              <div className="flex items-center gap-4 bg-dark-200 rounded-2xl p-6 h-full hover:bg-dark-300 transition-colors">
                <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                  {icon}
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm">{label}</h4>
                  <p className="text-gray-400 text-sm">{value}</p>
                </div>
              </div>
            )
            return href ? (
              <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                {content}
              </a>
            ) : (
              <div key={label}>{content}</div>
            )
          })}
        </div>

        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <a href="#top" className="inline-flex mb-5">
              <img
                src="/logo.png"
                alt="Nod Car Rent"
                className="w-40 h-auto"
              />
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
            <h3 className="text-white font-semibold mb-5">Book via Telegram</h3>
            <p className="text-gray-400 text-sm mb-4">
              Browse cars, check availability, and book directly through our Telegram bot — no app needed.
            </p>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 bg-[#229ED9] hover:bg-[#1a8bc4] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
            >
              <Send className="h-4 w-4" />
              Open @{TELEGRAM_BOT_USERNAME}
            </a>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Nod Car Rent. All rights reserved.
          </p>
          <a
            href={STAFF_LOGIN_URL}
            target="_blank"
            rel="noreferrer"
            className="text-gray-600 hover:text-gold text-xs transition-colors"
          >
            Staff Login →
          </a>
        </div>
      </div>
    </footer>
  )
}
