import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PromoterAppShell } from '@/components/promoter-shell'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } }

export default async function PromoterSettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?as=promoter&next=%2Fpromoter%2Fsettings')
  const role = (session.user as { role?: string }).role
  if (role !== 'PROMOTER' && role !== 'ADMIN') redirect('/promoter')
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, orgName: true, bio: true, website: true, password: true },
  })
  if (!user?.email) redirect('/login?as=promoter&next=%2Fpromoter%2Fsettings')
  return (
    <PromoterAppShell>
      <SettingsForm email={user.email} orgName={user.orgName ?? ''} bio={user.bio ?? ''} website={user.website ?? ''} hasPassword={!!user.password} />
    </PromoterAppShell>
  )
}
