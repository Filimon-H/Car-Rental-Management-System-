import { Phone, Mail, MapPin, Send } from 'lucide-react'
import { useState } from 'react'
import { contactInfo, telHref } from '../data/cars'

export default function Contact() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' })
  const [error, setError] = useState('')

  const update =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setError('')
    }

  // A name and a message are the minimum worth sending on.
  const canSend = form.name.trim() !== '' && form.message.trim() !== ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) {
      setError('Please add your name and a message.')
      return
    }

    const lines = [
      form.message.trim(),
      '',
      `Name: ${form.name.trim()}`,
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : null,
      form.email.trim() ? `Email: ${form.email.trim()}` : null,
    ].filter((line) => line !== null)

    const subject = `Rental enquiry from ${form.name.trim()}`
    const href =
      `mailto:${contactInfo.email}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(lines.join('\n'))}`

    window.location.href = href
  }

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
              { icon: <Phone className="h-5 w-5" />, label: 'Call Us', value: contactInfo.phones[0], href: telHref(contactInfo.phones[0]) },
              // Second number was plain text, so only the first was dialable.
              { icon: <Phone className="h-5 w-5" />, label: 'Call Us (alt)', value: contactInfo.phones[1], href: telHref(contactInfo.phones[1]) },
              { icon: <Mail className="h-5 w-5" />, label: 'Email Us', value: contactInfo.email, href: `mailto:${contactInfo.email}` },
              { icon: <MapPin className="h-5 w-5" />, label: 'Our Office', value: `${contactInfo.address.line1}, ${contactInfo.address.line2}, ${contactInfo.address.city}`,
                // Was href="#", which jumped to the top of the page.
                href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${contactInfo.address.line1}, ${contactInfo.address.line2}, ${contactInfo.address.city}`
                )}` },
            ].map(({ icon, label, value, href }) => (
              <a
                key={label}
                href={href}
                className="flex items-center gap-5 bg-dark-200 rounded-2xl p-6 group hover:border hover:border-gold transition-all"
              >
                <div className="w-14 h-14 border border-gold rounded-xl flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all flex-shrink-0">
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
            {/*
              A real form. Every field was previously uncontrolled and the
              button was a bare mailto, so a visitor's name, phone and message
              were discarded and their mail client opened empty — the site
              lost the enquiry it had just asked for.

              The message is composed into the mailto at submit time, so the
              lead survives without a backend. Storing enquiries server-side
              is the better answer and needs a table and an admin inbox.
            */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="contact-name" className="sr-only">Your name</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Your Name"
                  className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label htmlFor="contact-phone" className="sr-only">Phone number</label>
                <input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="Phone Number"
                  className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="sr-only">Email address</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  placeholder="Email Address"
                  className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="sr-only">Your message</label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={4}
                  required
                  value={form.message}
                  onChange={update('message')}
                  placeholder="Your message..."
                  className="w-full bg-dark-300 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold resize-none"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={!canSend}
                className="btn-gold-filled flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
                Send Message
              </button>
              <p className="text-xs text-gray-500 text-center">
                Opens your email app with the message ready to send.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
