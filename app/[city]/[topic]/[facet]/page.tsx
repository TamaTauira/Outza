import type { Metadata } from 'next'
import { ComboPage, comboMetadata } from '@/lib/combo-page'

export const revalidate = 300

type Props = { params: Promise<{ city: string; topic: string; facet: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, topic, facet } = await params
  return comboMetadata(city, [topic, facet])
}

export default async function Page({ params }: Props) {
  const { city, topic, facet } = await params
  return ComboPage({ citySlug: city, segments: [topic, facet] })
}
