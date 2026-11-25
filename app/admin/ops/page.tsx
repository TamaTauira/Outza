import { OpsAdminClient } from './ops-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operations', robots: { index: false }, openGraph: { title: 'Operations · VibePeep' } }

export default function AdminOpsPage() {
  return <OpsAdminClient />
}
