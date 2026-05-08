export interface Car {
  id: number
  name: string
  category: string
  image: string
  seats: number
  transmission: string
  ac: boolean
  price: number
  featured: boolean
}

export interface Category {
  id: string
  name: string
}

export interface Testimonial {
  id: number
  name: string
  role: string
  text: string
  rating: number
}

export interface ContactInfo {
  phones: string[]
  office: string
  email: string
  whatsapp: string
  address: { line1: string; line2: string; city: string }
}

export const cars: Car[] = [
  {
    id: 1,
    name: 'Toyota Corolla',
    category: 'sedan',
    image: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=600',
    seats: 5,
    transmission: 'Auto',
    ac: true,
    price: 3500,
    featured: true,
  },
  {
    id: 2,
    name: 'Toyota Land Cruiser',
    category: 'suv',
    image: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&q=80&w=600',
    seats: 7,
    transmission: 'Auto',
    ac: true,
    price: 8000,
    featured: true,
  },
  {
    id: 3,
    name: 'Toyota Hilux',
    category: 'pickup',
    image: 'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&q=80&w=600',
    seats: 5,
    transmission: 'Manual',
    ac: true,
    price: 5500,
    featured: true,
  },
  {
    id: 4,
    name: 'Toyota RAV4',
    category: 'suv',
    image: 'https://images.unsplash.com/photo-1606611013016-969c19ba27bb?auto=format&fit=crop&q=80&w=600',
    seats: 5,
    transmission: 'Auto',
    ac: true,
    price: 5000,
    featured: false,
  },
  {
    id: 5,
    name: 'Hyundai Accent',
    category: 'sedan',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=600',
    seats: 5,
    transmission: 'Auto',
    ac: true,
    price: 3000,
    featured: false,
  },
  {
    id: 6,
    name: 'Toyota Hiace Minivan',
    category: 'minivan',
    image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=600',
    seats: 12,
    transmission: 'Manual',
    ac: true,
    price: 6500,
    featured: true,
  },
]

export const categories: Category[] = [
  { id: 'all', name: 'All Cars' },
  { id: 'sedan', name: 'Sedan' },
  { id: 'suv', name: 'SUV' },
  { id: 'pickup', name: 'Pickup' },
  { id: 'minivan', name: 'Minivan' },
]

export const testimonials: Testimonial[] = [
  {
    id: 1,
    name: 'Michael T.',
    role: 'Business Traveler',
    text: 'Excellent service! The car was clean and well-maintained. Airport pickup was on time. Highly recommend Nod Car Rent for visitors to Addis Ababa.',
    rating: 5,
  },
  {
    id: 2,
    name: 'Sarah K.',
    role: 'Tourist from USA',
    text: 'Very professional and responsive on WhatsApp. Got a great SUV for our family trip. The pricing was fair and transparent. Will use again!',
    rating: 5,
  },
  {
    id: 3,
    name: 'Dawit A.',
    role: 'Local Customer',
    text: "I've been renting from Nod Car Rent for over a year now. Always reliable, always fair prices. The best car rental service in Addis Ababa!",
    rating: 5,
  },
]

export const contactInfo: ContactInfo = {
  phones: ['+251 911 669414', '+251 911 257351'],
  office: '+251 116 673267',
  email: 'nodcarrent@gmail.com',
  whatsapp: '251911669414',
  address: {
    line1: 'Around St. Gabriel Hospital',
    line2: 'KW Mall, 3rd Floor, #310',
    city: 'Addis Ababa, Ethiopia',
  },
}
