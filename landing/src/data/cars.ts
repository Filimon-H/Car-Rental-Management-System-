export interface ContactInfo {
  phones: string[]
  office: string
  email: string
  whatsapp: string
  address: { line1: string; line2: string; city: string }
}

/*
  The demo `cars` and `categories` arrays lived here. They described a fleet
  the company does not own — a Land Cruiser, a 12-seat Hiace, a Hyundai
  Accent — and kept leaking onto the site as if real: the hero's spec card,
  the fleet fallback. The fleet is read from /api/public/vehicles; the hero
  backdrop is a fixed set of stock photos in Hero.tsx.
*/

/*
  The `testimonials` array lived here: three invented reviews rendered with
  five-star ratings as if real customers had written them. Nobody had.
  Publishing reviews that were never given is deceptive advertising, so they
  are gone rather than relabelled -- a "sample" caption still reads as real
  on a live site. The Reviews section now shows facts that can be checked.
  Real ones belong in the backend with permission and a source.
*/

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

/**
 * A phone number as a tel: href.
 *
 * RFC 3966 does not allow spaces, and the display values are spaced for
 * readability, so linking them directly produced an invalid href.
 */
export const telHref = (phone: string) => `tel:${phone.replace(/[\s()-]/g, '')}`
