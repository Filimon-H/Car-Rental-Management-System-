export const cars = [
  {
    id: 1,
    name: "Toyota Corolla",
    category: "sedan",
    image: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Auto",
    ac: true,
    price: 3500,
    featured: true,
  },
  {
    id: 2,
    name: "Toyota Land Cruiser",
    category: "suv",
    image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&q=80&w=600",
    seats: 7,
    transmission: "Auto",
    ac: true,
    price: 8000,
    featured: true,
  },
  {
    id: 3,
    name: "Toyota Hilux",
    category: "pickup",
    image: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Manual",
    ac: true,
    price: 5500,
    featured: true,
  },
  {
    id: 4,
    name: "Toyota RAV4",
    category: "suv",
    image: "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Auto",
    ac: true,
    price: 5000,
    featured: false,
  },
  {
    id: 5,
    name: "Hyundai Accent",
    category: "sedan",
    image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Auto",
    ac: true,
    price: 3000,
    featured: false,
  },
  {
    id: 6,
    name: "Toyota Hiace Minivan",
    category: "minivan",
    image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=600",
    seats: 12,
    transmission: "Manual",
    ac: true,
    price: 6500,
    featured: true,
  },
  {
    id: 7,
    name: "Suzuki Swift",
    category: "sedan",
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Auto",
    ac: true,
    price: 2800,
    featured: false,
  },
  {
    id: 8,
    name: "Nissan X-Trail",
    category: "suv",
    image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=600",
    seats: 5,
    transmission: "Auto",
    ac: true,
    price: 5500,
    featured: false,
  },
];

export const categories = [
  { id: "all", name: "All Cars" },
  { id: "sedan", name: "Sedan" },
  { id: "suv", name: "SUV" },
  { id: "pickup", name: "Pickup" },
  { id: "minivan", name: "Minivan" },
];

export const testimonials = [
  {
    id: 1,
    name: "Michael T.",
    role: "Business Traveler",
    text: "Excellent service! The car was clean and well-maintained. Airport pickup was on time. Highly recommend Nod Car Rent for visitors to Addis Ababa.",
    rating: 5,
  },
  {
    id: 2,
    name: "Sarah K.",
    role: "Tourist from USA",
    text: "Very professional and responsive on WhatsApp. Got a great SUV for our family trip. The pricing was fair and transparent. Will use again!",
    rating: 5,
  },
  {
    id: 3,
    name: "Dawit A.",
    role: "Local Customer",
    text: "I've been renting from Nod Car Rent for over a year now. Always reliable, always fair prices. The best car rental service in Addis Ababa!",
    rating: 5,
  },
];

export const benefits = [
  {
    icon: "fa-plane-arrival",
    title: "Airport Pickup",
    description: "We'll meet you at Bole International Airport",
  },
  {
    icon: "fa-tools",
    title: "Well-Maintained Cars",
    description: "All vehicles are regularly serviced and cleaned",
  },
  {
    icon: "fa-whatsapp",
    iconType: "fab",
    title: "Fast WhatsApp Support",
    description: "Get quick responses and easy booking via WhatsApp",
  },
  {
    icon: "fa-tag",
    title: "No Hidden Fees",
    description: "Transparent pricing with no surprise charges",
  },
];

export const steps = [
  {
    number: 1,
    title: "Choose Your Car",
    description: "Browse our fleet and pick the vehicle that suits your needs",
  },
  {
    number: 2,
    title: "Contact Us",
    description: "Reach out via WhatsApp, phone, or the booking form",
  },
  {
    number: 3,
    title: "Confirm & Pay",
    description: "We'll confirm availability and arrange payment",
  },
  {
    number: 4,
    title: "Pick Up & Drive",
    description: "Collect your car from our office or airport pickup",
  },
];

export const contactInfo = {
  phones: ["+251 911 669414", "+251 911 257351"],
  office: "+251 116 673267",
  email: "nodcarrent@gmail.com",
  whatsapp: "251911669414",
  address: {
    line1: "Around St. Gabriel Hospital",
    line2: "KW Mall, 3rd Floor, #310",
    city: "Addis Ababa, Ethiopia",
  },
};
