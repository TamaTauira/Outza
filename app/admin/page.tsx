import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { TrustCount } from '@/components/admin-nav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — VibePeep', robots: { index: false } }

const CARDS = [
  { href: '/admin/trust', title: 'Trust & listings', body: 'Reports, organiser claims, and quality flags waiting on you.' },
  { href: '/admin/venues', title: 'Venue claims', body: 'Venue claims, disputes, and identity changes. A person decides.' },
  { href: '/admin/local', title: 'Local', body: 'Community listings to approve.' },
  { href: '/admin/community', title: 'Community hub', body: 'Neighbourhood submissions, removals and counters. Removals keep the audit trail.' },
  { href: '/admin/newsletter', title: 'Newsletter', body: 'Preview and send THE WEEKENDER.' },
  { href: '/admin/seo', title: 'SEO', body: 'Guides, indexing, and referrals.' },
  { href: '/admin/images', title: 'Images', body: 'Artwork pipeline.' },
  { href: '/admin/intel', title: 'Intelligence', body: 'Official data sources.' },
  { href: '/admin/sponsorship', title: 'Sponsorship', body: 'Paying organisers, repeat purchase, MRR and margin.' },
]

export default async function AdminHome() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This dashboard is for the site owner.</p>
      </main>
    )
  }
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-bold">Admin</h1>
      <p className="text-muted-foreground mt-1 mb-6">Owner tools. Trust & listings shows how many decisions are waiting.</p>
      <ul className="grid sm:grid-cols-2 gap-3">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link href={card.href} className="block h-full rounded-xl border border-border bg-card p-4 hover:bg-muted">
              <span className="font-semibold inline-flex items-center gap-2">
                {card.title}
                {card.href === '/admin/trust' && <TrustCount />}
              </span>
              <span className="block text-sm text-muted-foreground mt-1">{card.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
