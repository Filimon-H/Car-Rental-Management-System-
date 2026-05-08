import { Car, UserCheck, PlaneTakeoff } from 'lucide-react'

const services = [
  {
    number: '01',
    icon: <Car className="h-8 w-8 text-gold" />,
    title: 'Self-Drive Rental',
    description: 'Rent a car and drive yourself. Flexible daily, weekly, and monthly rates across our full fleet.',
    image: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=600',
  },
  {
    number: '02',
    icon: <UserCheck className="h-8 w-8 text-gold" />,
    title: 'Car with Driver',
    description: 'Sit back and relax with one of our experienced, professional drivers for any trip.',
    image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=600',
  },
  {
    number: '03',
    icon: <PlaneTakeoff className="h-8 w-8 text-gold" />,
    title: 'Airport Transfer',
    description: 'On-time pickup and drop-off at Bole International Airport. Available 24/7.',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=600',
  },
]

export default function Services() {
  return (
    <section id="services" className="py-24 bg-dark">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            What We Do
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Our </span>
            <span className="text-gold">Services</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {services.map((service) => (
            <div key={service.number} className="group relative rounded-2xl overflow-hidden card-hover">
              <div className="relative h-64">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <span className="absolute top-4 left-4 text-gold/40 text-5xl font-bold leading-none">
                  {service.number}
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="mb-3">{service.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{service.title}</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{service.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
