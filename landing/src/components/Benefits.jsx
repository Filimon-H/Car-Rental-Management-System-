export default function Benefits() {
  const benefits = [
    {
      icon: 'fa-wallet',
      title: 'Best price guaranteed',
      description: "Find a lower price? We'll refund you 100% of the difference.",
    },
    {
      icon: 'fa-user-check',
      title: 'Experience driver',
      description: "Don't have driver? Don't worry, we have many experienced driver for you.",
    },
    {
      icon: 'fa-clock',
      title: '24 hour car delivery',
      description: 'Book your car anytime and we will deliver it directly to you.',
    },
    {
      icon: 'fa-headset',
      title: '24/7 technical support',
      description: 'Have a question? Contact Rentcars support any time when you have problem.',
    },
  ];

  return (
    <section id="benefits" className="bg-white py-20 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute -left-[300px] top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#1572D3]/10 rounded-full blur-3xl"></div>

      <div className="max-w-[1120px] mx-auto px-6 relative">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left - Car Image */}
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80"
              alt="Audi car"
              className="w-full max-w-[813px]"
            />
          </div>

          {/* Right - Content */}
          <div className="space-y-14">
            {/* Header */}
            <div className="space-y-8">
              <span className="inline-block bg-[#1572D3]/10 text-[#1572D3] px-8 py-4 rounded-lg text-sm font-medium">
                WHY CHOOSE US
              </span>
              <h2 className="text-[38px] font-medium text-[#333333] leading-[130%]">
                We offer the best experience with our rental deals
              </h2>
            </div>

            {/* Benefits List */}
            <div className="space-y-10">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="flex items-start gap-6">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-[#ECF5FF] rounded-2xl flex items-center justify-center flex-shrink-0">
                    <i className={`fas ${benefit.icon} text-[#1572D3] text-2xl`}></i>
                  </div>
                  
                  {/* Text */}
                  <div className="space-y-2">
                    <h3 className="text-xl font-medium text-black">{benefit.title}</h3>
                    <p className="text-base text-[#6D6D6D]">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
