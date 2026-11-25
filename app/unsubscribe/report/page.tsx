import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { verify } from '@/lib/newsletter/links'
import { ReportUnsubscribeClient } from './report-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe from recaps — VibePeep', robots: { index: false } }

export default async function ReportUnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = '', k = '' } = await searchParams
  const valid = !!u && verify(k, u, 'report-unsub')
  return (
    <div className="min-h-screen bg-background">
    <SiteHeader variant="auth" />
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-lg">
        {valid ? <ReportUnsubscribeClient u={u} k={k} /> : (
          <>
            <h1 className="mt-4 font-display text-h1">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is invalid. You can turn the weekly recap off any time in the promoter dashboard.</p>
          </>
        )}
        <Link href="/promoter?tab=overview" className="mt-6 inline-block text-sm text-primary underline underline-offset-2">Back to the promoter dashboard</Link>
      </div>
    </main>
    </div>
  )
}
