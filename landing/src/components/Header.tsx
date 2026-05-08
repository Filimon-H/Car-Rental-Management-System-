import { useState, useEffect } from 'react'
import { ChevronDown, Phone, Menu, X, Car } from 'lucide-react'
import { contactInfo } from '../data/cars'

const navLinks = [
  { href: '#', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#services', label: 'Services' },
  { href: '#cars', label: 'Cars' },
  { href: '#contact', label: 'Contact' },
]

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault()
    if (href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setIsMenuOpen(false)
      return
    }
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
    setIsMenuOpen(false)
  }

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ? 'bg-dark-100/95 shadow-lg backdrop-blur-sm' : 'bg-dark-100/80 backdrop-blur-sm'
    }`}>
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <a href="#" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold">
              <Car className="h-4 w-4 text-black" />
            </div>
            <span className="text-xl font-bold tracking-wider">
              <span className="text-white">Nod</span>
              <span className="text-gold"> Car Rent</span>
            </span>
          </a>

          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className="flex items-center gap-1 text-sm font-medium text-white transition-colors hover:text-gold"
              >
                {link.label}
                {(link.label === 'Services' || link.label === 'Cars') && (
                  <ChevronDown className="h-3 w-3" />
                )}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-600">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Need help?</p>
              <p className="text-sm font-semibold text-white">{contactInfo.phones[0]}</p>
            </div>
          </div>

          <button
            className="lg:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-gray-800">
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => scrollToSection(e, link.href)}
                  className="text-sm font-medium text-white hover:text-gold"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-800">
              <Phone className="h-4 w-4 text-white" />
              <p className="text-sm font-semibold text-white">{contactInfo.phones[0]}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
