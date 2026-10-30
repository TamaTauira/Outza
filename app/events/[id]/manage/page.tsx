import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
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
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 pb-16">
      <ManageEvent eventId={id} />
    </main>
  )
}
