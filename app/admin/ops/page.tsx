import { OpsAdminClient } from './ops-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operations — VibePeep admin', robots: { index: false } }

export default function AdminOpsPage() {
  return <OpsAdminClient />
}
