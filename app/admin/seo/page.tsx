import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getSeoReport } from '@/lib/seo-report'
import { MIN_INDEX, eventPath } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SEO & organic discovery — Outza admin', robots: { index: false } }

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never'
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')
const SOURCE_LABEL: Record<string, string> = { SEARCH: 'Search engines (organic)', OUTZA: 'Inside Outza', SOCIAL: 'Social', EMAIL: 'Email', DIRECT: 'Direct / unknown', OTHER: 'Other websites' }

function Card({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card shadow-sm p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{sub}</p>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

export default async function AdminSeoPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/seo')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This page shows search and indexing health.</p>
      </main>
    )
  }
  const r = await getSeoReport()
  const sitemapTotal = r.sitemap.static + r.sitemap.guides + r.sitemap.suburbs + r.sitemap.events + r.sitemap.local
  const cities = [...new Set(r.pages.map((p) => p.city))]
  const topics = [...new Map(r.pages.map((p) => [p.topic, p.label])).entries()]
  const totalVisits = r.referrals.reduce((s, x) => s + x.visits, 0)

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">SEO & organic discovery</h1>
        <p className="text-muted-foreground mt-1">Built only from Outza’s own data. Nothing here is estimated. Generated {fmt(r.generatedAt)} · listings last refreshed {fmt(r.lastRefresh)}.</p>
      </header>

      <Card title="Search Console & Bing Webmaster" sub="Impressions, clicks, average position and top queries come from the search engines themselves.">
        <ul className="text-sm space-y-1.5">
          <li>Google ownership tag: <b>{r.verification.google ? 'set' : 'not set'}</b>{!r.verification.google && <span className="text-muted-foreground"> — add the code from Search Console as GOOGLE_SITE_VERIFICATION.</span>}</li>
          <li>Bing ownership tag: <b>{r.verification.bing ? 'set' : 'not set'}</b>{!r.verification.bing && <span className="text-muted-foreground"> — add the code from Bing Webmaster Tools as BING_SITE_VERIFICATION.</span>}</li>
          <li>Search performance data: <b>not connected</b><span className="text-muted-foreground"> — impressions, clicks, rankings and queries are not shown until a Search Console API connection exists. Submit <code>/sitemap.xml</code> in both tools after verifying.</span></li>
        </ul>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Sitemap" sub="URLs currently listed in /sitemap.xml">
          <table className="w-full text-sm"><tbody>
            {[['Core pages', r.sitemap.static], ['City & topic guides', r.sitemap.guides], ['Suburb pages', r.sitemap.suburbs], ['Upcoming events', r.sitemap.events], ['OUTZA Local listings', r.sitemap.local]].map(([k, v]) => (
              <tr key={k as string} className="border-b border-border/40"><td className="py-1.5">{k}</td><td className="py-1.5 text-right font-mono">{v}</td></tr>
            ))}
            <tr><td className="py-1.5 font-semibold">Total</td><td className="py-1.5 text-right font-mono font-semibold">{sitemapTotal}</td></tr>
          </tbody></table>
          <a href="/sitemap.xml" target="_blank" className="text-xs text-primary mt-2 inline-block">Open sitemap.xml</a>
        </Card>

        <Card title="Technical checks" sub="Counts straight from the listings database">
          <ul className="space-y-2.5 text-sm">
            {r.technical.map((t) => (
              <li key={t.label}><div className="flex justify-between gap-3"><span>{t.label}</span><span className="font-mono">{t.count}</span></div><p className="text-xs text-muted-foreground">{t.note}</p></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Event-page visits by source" sub="From event page referrers (bots excluded). Organic = arrived from a search engine.">
          {totalVisits === 0 ? <p className="text-sm text-muted-foreground">No visits recorded yet.</p> : (
            <table className="w-full text-sm"><tbody>
              {r.referrals.map((x) => (
                <tr key={x.source} className="border-b border-border/40"><td className="py-1.5">{SOURCE_LABEL[x.source] ?? x.source}</td><td className="py-1.5 text-right font-mono">{x.visits}</td><td className="py-1.5 text-right text-muted-foreground w-16">{pct(x.visits, totalVisits)}</td></tr>
              ))}
            </tbody></table>
          )}
        </Card>

        <Card title="Organic traffic & ticket click-through" sub="Ticket clicks aren’t tagged by source, so organic CTR is shown for events that received search visits.">
          {r.organic.visits === 0 ? (
            <p className="text-sm text-muted-foreground">No search-engine visits recorded yet. This fills in once pages are indexed and people arrive from Google or Bing.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between"><span>Organic visits</span><span className="font-mono">{r.organic.visits}</span></li>
              <li className="flex justify-between"><span>Events reached from search</span><span className="font-mono">{r.organic.events}</span></li>
              <li className="flex justify-between"><span>Ticket CTR on those events (all visitors)</span><span className="font-mono">{pct(r.organic.ticketClicksOnThoseEvents, r.organic.viewsOnThoseEvents)}</span></li>
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-3">Site-wide ticket CTR: {pct(r.overall.ticketClicks, r.overall.views)} ({r.overall.ticketClicks} clicks / {r.overall.views} views).</p>
          {r.topOrganic.length > 0 && (
            <div className="mt-3"><p className="text-xs font-semibold mb-1">Top event pages from search</p>
              <ul className="text-xs space-y-1">{r.topOrganic.map((e) => <li key={e.id} className="flex justify-between gap-2"><Link href={eventPath(e)} target="_blank" className="hover:underline truncate">{e.title} · {e.city}</Link><span className="font-mono">{e.visits}</span></li>)}</ul>
            </div>
          )}
        </Card>
      </div>

      <Card title="Opportunities" sub={`Guides close to the ${MIN_INDEX}-listing index threshold. More genuine listings (organiser submissions, OUTZA Local) would make them indexable.`}>
        {r.opportunities.length === 0 ? <p className="text-sm text-muted-foreground">Every guide with listings is already indexable.</p> : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
            {r.opportunities.slice(0, 30).map((o) => (
              <li key={o.path} className="flex justify-between gap-2"><Link href={o.path} target="_blank" className="hover:underline">{o.label} · {o.city}</Link><span className="text-muted-foreground text-xs">{o.total} live, needs {o.needed} more</span></li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Guide pages by city" sub={`Live listing counts. Green = indexed and in the sitemap (${MIN_INDEX}+); grey = noindex until there’s enough to show.`}>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead><tr><th className="text-left py-1.5 pr-3">Guide</th>{cities.map((c) => <th key={c} className="px-2 py-1.5 text-right whitespace-nowrap">{c}</th>)}</tr></thead>
            <tbody>
              {topics.map(([key, label]) => (
                <tr key={key} className="border-t border-border/40">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{label}</td>
                  {cities.map((c) => {
                    const p = r.pages.find((x) => x.city === c && x.topic === key)!
                    return <td key={c} className="px-2 py-1.5 text-right"><Link href={p.path} target="_blank" className={`font-mono hover:underline ${p.indexed ? 'text-emerald-500 font-semibold' : 'text-muted-foreground'}`}>{p.total}</Link></td>
                  })}
                </tr>
              ))}
              <tr className="border-t border-border/40"><td className="py-1.5 pr-3">Suburb pages</td>{r.suburbs.map((s) => <td key={s.city} className="px-2 py-1.5 text-right font-mono">{s.count}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}
