import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { PlanClient } from './plan-client'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Together plan',
  path: '/together',
  index: false,
})

export default async function TogetherPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <PageShell>
      <PlanClient token={token} />
    </PageShell>
  )
}
