import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { LandingViewBeacon } from '@/components/landing-beacon'
import { EventCard, GuideEventRow } from '@/components/event-card'
import { CITIES } from '@/lib/cities'
import { assessEditorial, editorialFacts, editorialGuide, editorialPath, EDITORIAL_GUIDES } from '@/lib/editorial'
import { cityPath, topicDef } from '@/lib/seo'
import { cityGuideModel, eventJsonLd, jsonLdString, landingData, lastRefreshAt } from '@/lib/seo-server'
import { BRAND_OG_IMAGE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

async function load(slug: string) {
  const guide = editorialGuide(slug)
  if (!guide) return null
  const models = await Promise.all(CITIES.map(async (city) => ({ city, model: await cityGuideModel(city) })))
  const rows = models.map(({ city, model }) => {
    const decision = model.ok ? model.decisions.find((d) => d.path === cityPath(city, guide.topic)) : undefined
    return { city, total: decision?.total ?? 0, index: !!decision?.index }
  })
  const gate = assessEditorial(rows.map((r) => r.total))
  return { guide, rows, gate }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const loaded = await load(slug)
  if (!loaded || loaded.gate.reason === 'empty') return { title: 'Page not found | VibePeep', robots: { index: false } }
  const path = editorialPath(loaded.guide.slug)
  const description = `${loaded.guide.description} ${loaded.gate.total} upcoming listings.`
  return {
    title: `${loaded.guide.h1} | VibePeep`,
    description,
    alternates: { canonical: path },
    robots: loaded.gate.index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: loaded.guide.h1, description, url: path, images: [BRAND_OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: loaded.guide.h1, description, images: [BRAND_OG_IMAGE] },
  }
}

export default async function EditorialGuidePage({ params }: Props) {
  const { slug } = await params
  const loaded = await load(slug)
  if (!loaded || loaded.gate.reason === 'empty') notFound()
  const { guide, rows, gate } = loaded
  const path = editorialPath(guide.slug)
  const shown = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
  const samples = await Promise.all(shown.slice(0, 4).map(async (row) => {
    const data = await landingData(row.city, topicDef(guide.topic) ?? null, undefined, 3).catch(() => null)
    return { city: row.city, events: data?.events ?? [] }
  }))
  const events = samples.flatMap((s) => s.events).slice(0, 12)
  const origin = siteUrl()
  const refreshed = await lastRefreshAt()
  const facts = editorialFacts(guide, gate.total, shown.length)
  const listingQuery = `lp=${encodeURIComponent(path)}`
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'VibePeep', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: guide.label, item: `${origin}${path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: guide.h1,
      url: `${origin}${path}`,
      description: guide.description,
      inLanguage: 'en-AU',
      ...(refreshed ? { dateModified: refreshed.toISOString() } : {}),
      about: { '@type': 'Country', name: 'Australia' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: facts.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    },
    ...(events.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: guide.h1,
      numberOfItems: gate.total,
      itemListElement: events.slice(0, 12).map((event, i) => ({ '@type': 'ListItem', position: i + 1, item: eventJsonLd(event, origin) })),
    }] : []),
  ]
  const hubs = EDITORIAL_GUIDES.filter((g) => g.slug !== guide.slug)

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <LandingViewBeacon path={path} />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">VibePeep</Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">{guide.label}</span>
        </nav>
        <header className="max-w-3xl">
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight">{guide.h1}</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{guide.description}</p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {gate.total} upcoming {gate.total === 1 ? 'listing' : 'listings'} across {shown.length} {shown.length === 1 ? 'city' : 'cities'}.
            Open a city guide for the full list. Dates and prices are the ones organisers published.
          </p>
          {refreshed && (
            <p className="mt-2 text-xs text-muted-foreground">
              Listings last refreshed <time dateTime={refreshed.toISOString()}>{refreshed.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>.
            </p>
          )}
        </header>

        <nav aria-label="Topics" className="mt-6 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
          {EDITORIAL_GUIDES.map((g) => (
            <Link key={g.slug} href={editorialPath(g.slug)} aria-current={g.slug === guide.slug ? 'page' : undefined}
              className={g.slug === guide.slug ? 'shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground' : 'shrink-0 rounded-full bg-card px-3.5 py-1.5 text-sm shadow-sm hover:bg-muted'}>
              {g.label}
            </Link>
          ))}
        </nav>

        <section className="mt-8" aria-labelledby="cities">
          <h2 id="cities" className="font-display text-xl font-bold mb-4">By city</h2>
          <ul className="flex flex-wrap gap-2">
            {shown.map((row) => (
              <li key={row.city.name}>
                <Link href={cityPath(row.city, guide.topic)} className="inline-block rounded-lg bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted">
                  {row.city.name} <span className="text-muted-foreground">({row.total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {events.length > 0 && (
          <section className="mt-10" aria-labelledby="sample">
            <h2 id="sample" className="font-display text-xl font-bold mb-4">On soon</h2>
            <div className="divide-y overflow-hidden rounded-xl border border-border bg-card md:hidden">
              {events.map((e) => <GuideEventRow key={e.id} listingQuery={listingQuery} event={{ ...e, date: e.date.toISOString(), imageAsset: e.imageAsset as never }} />)}
            </div>
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((e, i) => <EventCard key={e.id} index={i} listingQuery={listingQuery} event={{ ...e, date: e.date.toISOString(), imageAsset: e.imageAsset as never }} />)}
            </div>
          </section>
        )}

        <section className="mt-12 max-w-3xl" aria-labelledby="guide-facts">
          <h2 id="guide-facts" className="font-display text-xl font-bold mb-3">Good to know</h2>
          <dl className="space-y-3">
            {facts.map((f) => (
              <div key={f.question}>
                <dt className="font-semibold">{f.question}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {hubs.length > 0 && (
          <p className="mt-10 text-sm text-muted-foreground">
            Also peep {hubs.map((g, i) => (
              <span key={g.slug}>{i > 0 ? (i === hubs.length - 1 ? ' and ' : ', ') : ''}<Link href={editorialPath(g.slug)} className="text-primary underline">{g.label.toLowerCase()}</Link></span>
            ))}.
          </p>
        )}
      </main>
    </PageShell>
  )
}
