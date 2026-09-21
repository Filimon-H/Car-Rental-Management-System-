import { useState, useEffect } from 'react'
import { ChevronDown, Phone, Menu, X, User, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { contactInfo } from '../data/cars'
import { useAuthStore } from '../services/auth'

const TELEGRAM_BOT_URL = 'https://t.me/Novacar67_bot'

export default function Header() {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const token = useAuthStore((s) => s.token)
  const profile = useAuthStore((s) => s.profile)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const logout = useAuthStore((s) => s.logout)

  const navLinks = [
    { href: '#', label: t('nav.home') },
    { href: '#about', label: t('nav.about') },
    { href: '#services', label: t('nav.services') },
    { href: '#cars', label: t('nav.cars') },
    { href: '#contact', label: t('nav.contact') },
  ]

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (token && !profile) fetchProfile()
  }, [token, profile, fetchProfile])

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
        <div className="flex items-center justify-between h-28">

          {/* Logo */}
          <a href="#" className="flex items-center flex-shrink-0" onClick={(e) => scrollToSection(e, '#')}>
            <img src="/logo.png" alt="Nod Car Rent" className="h-20 md:h-24 w-auto" />
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
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

          {/* Desktop right actions */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Telegram */}
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 text-[#229ED9] text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Telegram
            </a>

            {/* Phone */}
            <div className="flex items-center gap-2 border-x border-gray-700 px-3">
              <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <p className="text-sm font-semibold text-white whitespace-nowrap">{contactInfo.phones[0]}</p>
            </div>

            {/* Auth */}
            {token ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/my-bookings"
                  className="flex items-center gap-2 bg-gold hover:bg-gold-light text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
                >
                  <User className="h-4 w-4" />
                  {profile ? profile.first_name : t('nav.myBookings')}
                </Link>
                <button
                  onClick={logout}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  {t('nav.signOut')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-sm text-gray-300 hover:text-gold transition-colors px-2"
                >
                  {t('nav.signIn')}
                </Link>
                <Link
                  to="/signup"
                  className="text-sm bg-gold hover:bg-gold-light text-white font-semibold px-4 py-2 rounded-full transition-colors"
                >
                  {t('nav.signUp')}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="lg:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile menu */}
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
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-semibold text-white">{contactInfo.phones[0]}</p>
              </div>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-[#229ED9] text-sm font-medium"
              >
                <Send className="h-4 w-4" />
                Book on Telegram (@Novacar67_bot)
              </a>
              {token ? (
                <>
                  <Link
                    to="/my-bookings"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 text-sm font-semibold bg-gold text-white px-4 py-2 rounded-full w-fit"
                  >
                    <User className="h-4 w-4" />
                    {profile ? profile.first_name : t('nav.myBookings')}
                  </Link>
                  <button
                    onClick={() => { logout(); setIsMenuOpen(false) }}
                    className="text-sm text-gray-400 text-left"
                  >
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)} className="text-sm text-gold">
                    {t('nav.signIn')}
                  </Link>
                  <Link to="/signup" onClick={() => setIsMenuOpen(false)} className="text-sm text-gold">
                    {t('nav.signUp')}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
