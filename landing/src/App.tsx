import Header from './components/Header'
import Hero from './components/Hero'
import About from './components/About'
import Services from './components/Services'
import Fleet from './components/Fleet'
import HowItWorks from './components/HowItWorks'
import Testimonials from './components/Testimonials'
import Contact from './components/Contact'
import Footer from './components/Footer'

function App() {
  return (
    <main className="min-h-screen bg-dark">
      <Header />
      <Hero />
      <About />
      <Services />
      <Fleet />
      <HowItWorks />
      <Testimonials />
      <Contact />
      <Footer />
    </main>
  )
}

export default App
