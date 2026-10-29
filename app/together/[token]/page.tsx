import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { PlanClient } from './plan-client'

export const metadata: Metadata = {
  title: 'Together plan',
  robots: { index: false, follow: false },
}

export default async function TogetherPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <PageShell>
      <PlanClient token={token} />
    </PageShell>
  )
}
