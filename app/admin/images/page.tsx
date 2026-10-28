import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ImagesAdminClient } from './images-admin-client'

export const dynamic = 'force-dynamic'

export default async function AdminImagesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/images')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This page manages event artwork across Outza.</p>
      </main>
    )
  }
  return <ImagesAdminClient />
}
