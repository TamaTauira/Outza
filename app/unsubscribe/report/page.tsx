import Link from 'next/link'
import { verify } from '@/lib/newsletter/links'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { ReportUnsubscribeClient } from './report-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe from recaps — VibePeep', robots: { index: false } }

export default async function ReportUnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = '', k = '' } = await searchParams
  const valid = !!u && verify(k, u, 'report-unsub')
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-lg">
        <Link href="/" aria-label="VibePeep home" className="inline-flex"><VibePeepLogo size="md" /></Link>
        {valid ? <ReportUnsubscribeClient u={u} k={k} /> : (
          <>
            <h1 className="mt-4 font-display text-2xl font-bold">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is invalid. You can turn the weekly recap off any time in the promoter dashboard.</p>
          </>
        )}
        <Link href="/promoter?tab=overview" className="mt-6 inline-block text-sm text-primary underline underline-offset-2">Back to the promoter dashboard</Link>
      </div>
    </main>
  )
}
