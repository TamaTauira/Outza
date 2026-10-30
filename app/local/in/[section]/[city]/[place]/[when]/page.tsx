import type { Metadata } from 'next'
import { CommunityBoard, communityMeta } from '@/components/community-board'

type Props = { params: Promise<{ section: string; city: string; place: string; when: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await params
  const s = await searchParams
  return communityMeta({ sectionKey: p.section, cityParam: p.city, place: p.place, whenParam: p.when, search: s })
}

export default async function CommunityWhenPage({ params, searchParams }: Props) {
  const p = await params
  const s = await searchParams
  return <CommunityBoard sectionKey={p.section} cityParam={p.city} place={p.place} whenParam={p.when} search={s} />
}
