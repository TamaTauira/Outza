import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GuideLanding } from '@/components/guide-landing'
import { CITIES } from '@/lib/cities'
import { INDEX_MIN_LISTINGS } from '@/lib/indexability'
import { seasonFacts, seasonCopy, seasonDef, seasonPath, seasonWindow, type SeasonDecision, type SeasonDef } from '@/lib/seasons'
import { cityFromSlug, cityPath } from '@/lib/seo'
import { cityGuideModel, landingData, lastRefreshAt } from '@/lib/seo-server'
import { BRAND_OG_IMAGE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

type Loaded = {
  city: (typeof CITIES)[number]
  season: SeasonDef
  path: string
  window: { from: string; to: string }
  decision: SeasonDecision | null
  index: boolean
  data: Awaited<ReturnType<typeof landingData>>
  copy: ReturnType<typeof seasonCopy>
}

async function loadSeason(citySlug: string, seasonSlug: string): Promise<Loaded | null> {
  if (citySlug.includes('.') || seasonSlug.includes('.')) return null
  const season = seasonDef(seasonSlug)
  const city = cityFromSlug(citySlug)
  if (!season || !city) return null
  const model = await cityGuideModel(city)
  const decision = model.seasons.find((s) => s.key === season.key) ?? null
  if (model.ok && (!decision || decision.total <= 0)) return null
  const window = decision ? { from: decision.from, to: decision.to } : seasonWindow(season.key, city)
  const data = await landingData(city, null, undefined, 60, undefined, window)
  if (data.total === 0) return null
  const index = model.ok
    ? !!(decision?.index && data.total >= INDEX_MIN_LISTINGS)
    : data.total >= INDEX_MIN_LISTINGS
  const copy = seasonCopy({ city: city.name, season, from: window.from, to: window.to, total: data.total })
  return { city, season, path: seasonPath(city, season.key), window, decision, index, data, copy }
}

export async function seasonMetadata(citySlug: string, seasonSlug: string): Promise<Metadata> {
  const loaded = await loadSeason(citySlug, seasonSlug)
  if (!loaded) return { title: 'Page not found | VibePeep', robots: { index: false } }
  const { path, copy, index } = loaded
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: copy.title, description: copy.description, url: path, images: [BRAND_OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description, images: [BRAND_OG_IMAGE] },
  }
}

export async function SeasonPage({ citySlug, seasonSlug }: { citySlug: string; seasonSlug: string }) {
  const loaded = await loadSeason(citySlug, seasonSlug)
  if (!loaded) notFound()
  const { city, season, path, window, data, copy } = loaded
  const [refreshed, models] = await Promise.all([lastRefreshAt(), Promise.all(CITIES.map(async (c) => ({ c, model: await cityGuideModel(c) })))])
  const origin = siteUrl()
  const facts = seasonFacts({ city: city.name, season, from: window.from, to: window.to, total: data.total })
  const otherCities = models
    .filter(({ c, model }) => c.name !== city.name && model.seasons.some((s) => s.key === season.key && s.index))
    .map(({ c }) => ({ href: seasonPath(c, season.key), label: season.h1(c.name) }))
  return (
    <GuideLanding
      city={city}
      topic={null}
      suburb={null}
      when={null}
      heading={copy.h1}
      blurb={copy.description}
      path={path}
      origin={origin}
      events={data.events}
      local={data.local}
      total={data.total}
      from={data.from}
      to={data.to}
      suburbs={[]}
      guides={[]}
      activeGuide={null}
      otherCities={otherCities}
      facts={facts}
      refreshed={refreshed}
      related={[]}
      crumbs={[
        { name: 'VibePeep', url: `${origin}/` },
        { name: city.name, url: `${origin}${cityPath(city)}` },
        { name: season.label, url: `${origin}${path}` },
      ]}
      seasons={models.find((m) => m.c.name === city.name)?.model.seasons.filter((s) => s.index && s.path !== path).map((s) => ({ href: s.path, title: seasonDef(s.key)?.h1(city.name) ?? s.key })) ?? []}
    />
  )
}
