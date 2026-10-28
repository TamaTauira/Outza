import { notFound, permanentRedirect } from 'next/navigation'
import { cityFromSlug, cityPath } from '@/lib/seo'

export default async function CityRoot({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  if (city.includes('.')) notFound()
  const def = cityFromSlug(city)
  if (!def) notFound()
  permanentRedirect(cityPath(def))
}
