import { CarFront, Headphones, MapPin, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { bookingService } from '../services/booking'

/**
 * Social proof from verifiable facts, not invented reviews.
 *
 * This section used to render three hardcoded reviews from `cars.ts` with
 * five-star ratings and initials avatars, presented as genuine customer
 * feedback. None was ever given: there is no reviews API and no admin screen
 * behind them, and one made a specific factual claim ("renting for over a
 * year") attributed to a named person. Publishing reviews nobody wrote is
 * deceptive advertising and a consumer-protection problem, not only an
 * ethical one. A "sample" label would not have helped; on a live site that
 * still reads as real.
 *
 * What replaces them is checkable. The fleet count comes from the same
 * /api/public/vehicles the fleet section renders, so it cannot drift from
 * what a visitor can see, and it is omitted entirely if the call fails
 * rather than falling back to a number. The rest are structural facts about
 * how the business runs. Real testimonials belong here once they exist, with
 * permission and a source — they need a table and an admin screen first.
 */
export default function Testimonials() {
  const { t } = useTranslation()

  const { data: vehicles } = useQuery({
    queryKey: ['public-vehicles'],
    queryFn: bookingService.getVehicles,
    staleTime: 60_000,
  })

  const fleetSize = vehicles?.length ?? null

  const facts = [
    fleetSize
      ? {
          icon: <CarFront className="h-5 w-5" />,
          value: `${fleetSize}`,
          label: t('proof.fleetLabel'),
        }
      : null,
    {
      icon: <MapPin className="h-5 w-5" />,
      value: t('proof.deliveryValue'),
      label: t('proof.deliveryLabel'),
    },
    {
      icon: <Headphones className="h-5 w-5" />,
      value: t('proof.supportValue'),
      label: t('proof.supportLabel'),
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      value: t('proof.insuredValue'),
      label: t('proof.insuredLabel'),
    },
  ].filter((f): f is NonNullable<typeof f> => f !== null)

  return (
    <section className="py-24 bg-dark">
      <div className="section-divider mb-16" />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-gold text-sm tracking-[0.3em] uppercase mb-4 block">
            {t('proof.eyebrow')}
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            <span className="text-white">{t('proof.title1')} </span>
            <span className="text-gold">{t('proof.title2')}</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {facts.map(({ icon, value, label }) => (
            <div key={label} className="bg-dark-200 rounded-2xl p-8 text-center card-hover">
              <div className="w-12 h-12 rounded-xl bg-gold/20 text-gold flex items-center justify-center mx-auto mb-5">
                {icon}
              </div>
              <p className="text-white text-2xl font-bold mb-1">{value}</p>
              <p className="text-gray-400 text-sm">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-500 text-sm mt-10">
          {t('proof.footnote')}
        </p>
      </div>
    </section>
  )
}
