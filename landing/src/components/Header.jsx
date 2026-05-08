import { useState, useEffect } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#', label: 'Home', hasDropdown: true },
    { href: '#about', label: 'About' },
    { href: '#services', label: 'Services', hasDropdown: true },
    { href: '#cars', label: 'Cars', hasDropdown: true },
    { href: '#blog', label: 'Blog', hasDropdown: true },
    { href: '#contact', label: 'Contact' },
  ];

  const scrollToSection = (e, href) => {
    e.preventDefault();
    if (href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsMenuOpen(false);
      return;
    }
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ? 'bg-[#1a1a1a]/95 backdrop-blur-sm' : 'bg-[#1a1a1a]/95 backdrop-blur-sm'
    }`}>
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <a href="#" className="flex items-center">
            <span className="text-2xl font-bold tracking-wider">
              <span className="text-white">REN</span>
              <span className="text-gold">AX</span>
            </span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link, index) => (
              <div key={link.href + index} className="relative group">
                <a
                  href={link.href}
                  onClick={(e) => scrollToSection(e, link.href)}
                  className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-gold ${
                    link.label === 'Home' ? 'text-gold' : 'text-white'
                  }`}
                >
                  {link.label}
                  {link.hasDropdown && <i className="fas fa-chevron-down text-xs ml-1"></i>}
                </a>
              </div>
            ))}
          </nav>

          {/* Phone Number */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-gray-600 flex items-center justify-center">
              <i className="fas fa-phone text-white"></i>
            </div>
            <div>
              <p className="text-xs text-gray-400">Need help?</p>
              <p className="text-white font-semibold">855 100 4444</p>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <i className={`fas ${isMenuOpen ? 'fa-times' : 'fa-bars'} text-xl`}></i>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-gray-800">
            <nav className="flex flex-col gap-4">
              {navLinks.map((link, index) => (
                <a
                  key={link.href + index}
                  href={link.href}
                  onClick={(e) => scrollToSection(e, link.href)}
                  className={`text-sm font-medium ${
                    link.label === 'Home' ? 'text-gold' : 'text-white'
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-800">
              <div className="w-10 h-10 rounded-full border border-gray-600 flex items-center justify-center">
                <i className="fas fa-phone text-white text-sm"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Need help?</p>
                <p className="text-white font-semibold">855 100 4444</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
