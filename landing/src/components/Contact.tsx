import { Phone, Mail, MapPin, Send } from 'lucide-react'
import { useState } from 'react'
import { contactInfo } from '../data/cars'

export default function Contact() {
  const [email, setEmail] = useState('')

  return (
    <section id="contact" className="py-24 bg-dark-100">
      <div className="section-divider mb-16" />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            Get In Touch
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Contact </span>
            <span className="text-gold">Us</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-6">
            {[
              { icon: <Phone className="h-5 w-5" />, label: 'Call Us', value: contactInfo.phones.join(' / '), href: `tel:${contactInfo.phones[0]}` },
              { icon: <Mail className="h-5 w-5" />, label: 'Email Us', value: contactInfo.email, href: `mailto:${contactInfo.email}` },
              { icon: <MapPin className="h-5 w-5" />, label: 'Our Office', value: `${contactInfo.address.line1}, ${contactInfo.address.line2}, ${contactInfo.address.city}`, href: '#' },
            ].map(({ icon, label, value, href }) => (
              <a
                key={label}
                href={href}
                className="flex items-center gap-5 bg-dark-200 rounded-2xl p-6 group hover:border hover:border-gold transition-all"
              >
                <div className="w-14 h-14 border border-gold rounded-xl flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-black transition-all flex-shrink-0">
                  {icon}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-white font-semibold">{value}</p>
                </div>
              </a>
            ))}

            <a
              href={`https://wa.me/${contactInfo.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-semibold transition-colors w-full"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.523 5.859L0 24l6.335-1.501A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.799 9.799 0 01-5.003-1.372l-.36-.213-3.76.89.952-3.666-.234-.376A9.79 9.79 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
              Chat on WhatsApp
            </a>
          </div>

          <div className="bg-dark-200 rounded-2xl p-8">
            <h3 className="text-white text-xl font-semibold mb-6">Send us a message</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Your Name"
                className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
              />
              <textarea
                rows={4}
                placeholder="Your message..."
                className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold resize-none"
              />
              <a
                href={`mailto:${contactInfo.email}`}
                className="btn-gold-filled flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold"
              >
                <Send className="h-4 w-4" />
                Send Message
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
