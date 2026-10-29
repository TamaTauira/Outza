import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { NewsletterAdminClient } from './newsletter-admin-client'

export const dynamic = 'force-dynamic'

export default async function AdminNewsletterPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/newsletter')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This page previews and tests the VibePeep newsletter.</p>
      </main>
    )
  }
  return <NewsletterAdminClient />
}
