import Header from './components/Header';
import Hero from './components/Hero';
import About from './components/About';
import Services from './components/Services';
import BookingForm from './components/BookingForm';
import CarFleet from './components/Fleet';
import CarTypes from './components/CarTypes';
import Process from './components/HowItWorks';
import VideoSection from './components/VideoSection';
import Testimonials from './components/Testimonials';
import Blog from './components/Blog';
import CTA from './components/CTA';
import BrandLogos from './components/BrandLogos';
import Footer from './components/Footer';

function App() {
  return (
    <main className="min-h-screen bg-[#121212]">
      <Header />
      <Hero />
      <About />
      <Services />
      <BookingForm />
      <CarFleet />
      <CarTypes />
      <Process />
      <VideoSection />
      <Testimonials />
      <Blog />
      <CTA />
      <BrandLogos />
      <Footer />
    </main>
  );
}

export default App;
