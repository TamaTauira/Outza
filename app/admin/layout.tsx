import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AdminNav } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin')
  const role = (session.user as { role?: string }).role
  if (role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">This area is for VibePeep admins.</p>
        <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Home</Link>
      </main>
    )
  }
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      {children}
    </div>
  )
}
