import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccountClient } from './account-client'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/account')
  return <AccountClient />
}
