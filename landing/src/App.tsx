import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Hero from './components/Hero'
import About from './components/About'
import Services from './components/Services'
import Fleet from './components/Fleet'
import HowItWorks from './components/HowItWorks'
import Testimonials from './components/Testimonials'
import Contact from './components/Contact'
import Footer from './components/Footer'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import BookingPage from './pages/BookingPage'
import MyBookingsPage from './pages/MyBookingsPage'
import { useAuthStore } from './services/auth'

function LandingPage() {
  /*
    Header and Footer used to sit inside <main>, so the banner and
    contentinfo landmarks were nested in the main landmark and a skip link
    would have had nothing to skip. #top stays on the wrapper because the
    logo links point at it.
  */
  return (
    <div id="top" className="min-h-screen bg-dark">
      {/*
        20+ header and nav links come before the content, so keyboard users
        had to tab through all of them on every visit. Visible on focus only.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-gold focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <About />
        <Services />
        <Fleet />
        <HowItWorks />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}

/** Redirect to /login when not authenticated, preserving the intended destination. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function App() {
  const { token, fetchProfile } = useAuthStore()

  // On every hard refresh, re-validate the stored token against the server.
  // If it's expired the store already cleared it; if the server rejects it (e.g.
  // after a logout-all), fetchProfile will catch the 401 and clear it too.
  useEffect(() => {
    if (token) fetchProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/book/:vehicleId"
        element={
          <RequireAuth>
            <BookingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <RequireAuth>
            <MyBookingsPage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
