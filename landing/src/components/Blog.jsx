const posts = [
  {
    id: 1,
    category: 'Airport',
    title: 'How to Rent a Car at the Airport Terminal?',
    date: { day: '23', month: 'Apr' },
    image: 'https://ext.same-assets.com/827312978/2442046957.jpeg',
  },
  {
    id: 2,
    category: 'Travel',
    title: 'Top 10 Scenic Road Trips for Your Next Adventure',
    date: { day: '18', month: 'Apr' },
    image: 'https://ext.same-assets.com/827312978/898128096.jpeg',
  },
  {
    id: 3,
    category: 'Tips',
    title: 'Essential Things to Check Before Renting a Car',
    date: { day: '12', month: 'Apr' },
    image: 'https://ext.same-assets.com/827312978/344592956.jpeg',
  },
];

export default function Blog() {
  return (
    <section id="blog" className="py-24 bg-[#1a1a1a]">
      {/* Section Divider */}
      <div className="section-divider mb-16" />

      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            OUR BLOG
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">Latest </span>
            <span className="text-gold">News</span>
          </h2>
        </div>

        {/* Blog Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {posts.map((post) => (
            <div
              key={post.id}
              className="group bg-[#222222] rounded-2xl overflow-hidden card-hover"
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Date Badge */}
                <div className="absolute top-4 left-4 bg-gold text-black px-4 py-2 rounded-lg text-center">
                  <span className="block text-2xl font-bold leading-none">{post.date.day}</span>
                  <span className="text-xs uppercase">{post.date.month}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <span className="text-gold text-sm">{post.category}</span>
                <h3 className="text-xl font-semibold text-white mt-2 mb-4 group-hover:text-gold transition-colors">
                  {post.title}
                </h3>
                <button className="flex items-center gap-2 text-gray-400 hover:text-gold transition-colors">
                  Read More
                  <i className="fas fa-arrow-right text-sm"></i>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-8">
          <div className="w-3 h-3 rounded-full bg-gold" />
          <div className="w-3 h-3 rounded-full bg-white/30" />
        </div>
      </div>
    </section>
  );
}
