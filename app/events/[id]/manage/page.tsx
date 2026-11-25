import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PromoterAppShell } from '@/components/promoter-shell'
import { ownershipUiEnabled } from '@/lib/ownership'
import { ManageEvent } from './manage-client'

export const dynamic = 'force-dynamic'

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-sm text-muted-foreground">Event management tools are turned off.</main>
  }
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/events/${id}/manage`)}`)
  if (!id) notFound()
  return (
    <PromoterAppShell backHref="/promoter?tab=events" backLabel="My events">
      <main className="vp-wrap vp-page-top vp-stack px-4 pb-16 sm:px-6">
        <ManageEvent eventId={id} />
      </main>
    </PromoterAppShell>
  )
}
