const quickLinks = [
  { name: 'About', href: '#about' },
  { name: 'Cars', href: '#cars' },
  { name: 'Car Types', href: '#' },
  { name: 'Team', href: '#' },
  { name: 'Contact', href: '#contact' },
];

const socialLinks = [
  { name: 'WhatsApp', icon: 'fab fa-whatsapp' },
  { name: 'Facebook', icon: 'fab fa-facebook-f' },
  { name: 'YouTube', icon: 'fab fa-youtube' },
];

export default function Footer() {
  return (
    <footer className="bg-[#121212] pt-24 pb-8">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Contact Info Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="flex items-center gap-4 bg-[#222222] rounded-2xl p-6">
            <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
              <i className="fas fa-phone text-black"></i>
            </div>
            <div>
              <h4 className="text-white font-semibold">Call us</h4>
              <p className="text-gray-400">+971 52-333-4444</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-[#222222] rounded-2xl p-6">
            <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
              <i className="fas fa-envelope text-black"></i>
            </div>
            <div>
              <h4 className="text-white font-semibold">Write to us</h4>
              <p className="text-gray-400">info@renax.com</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-[#222222] rounded-2xl p-6">
            <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
              <i className="fas fa-map-marker-alt text-black"></i>
            </div>
            <div>
              <h4 className="text-white font-semibold">Address</h4>
              <p className="text-gray-400">Dubai, Water Tower, Office 123</p>
            </div>
          </div>
        </div>

        {/* Footer Content */}
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div>
            <a href="#" className="flex items-center mb-6">
              <span className="text-2xl font-bold tracking-wider">
                <span className="text-white">REN</span>
                <span className="text-gold">AX</span>
              </span>
            </a>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Rent a car imperdiet sapien porttito the bibenum ellentesue the
              commodo erat nesuen.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <button
                  key={social.name}
                  className="w-12 h-12 rounded-full border border-gray-700 flex items-center justify-center hover:border-gold hover:bg-gold group transition-colors"
                >
                  <i className={`${social.icon} text-gray-400 group-hover:text-black`}></i>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white text-xl font-semibold mb-6">Quick Links</h3>
            <ul className="space-y-4">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-gold transition-colors flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-gold" />
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Subscribe */}
          <div className="md:col-span-2">
            <h3 className="text-white text-xl font-semibold mb-6">Subscribe</h3>
            <p className="text-gray-400 text-sm mb-6">
              Want to be notified about our services. Just sign up and we'll send
              you a notification by email.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email Address"
                className="flex-1 bg-[#222222] border border-gray-700 rounded-full px-6 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-gold"
              />
              <button
                className="w-12 h-12 rounded-full bg-gold flex items-center justify-center hover:bg-[#d4af37] transition-colors"
              >
                <i className="fas fa-paper-plane text-black"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800 pt-8">
          <p className="text-gray-500 text-sm text-center">
            ©{new Date().getFullYear()}{' '}
            <a href="#" className="text-gold hover:underline">
              DuruThemes
            </a>
            . All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
