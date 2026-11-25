import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { verify } from '@/lib/newsletter/links'
import { UnsubscribeClient } from './unsubscribe-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe', openGraph: { title: 'Unsubscribe · VibePeep' } }

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = '', k = '', s = '' } = await searchParams
  const valid = !!u && verify(k, u, 'unsub')
  return (
    <div className="min-h-screen bg-background">
    <SiteHeader variant="auth" />
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-lg">
        {valid ? (
          <UnsubscribeClient u={u} k={k} s={s} />
        ) : (
          <>
            <h1 className="mt-4 font-display text-h1">Link not recognised</h1>
            <p className="mt-2 text-muted-foreground text-sm">This unsubscribe link is invalid. You can turn emails off any time in your account. The newsletter, the saved-event digest and reminders share that one switch.</p>
          </>
        )}
        <Link href="/account" className="mt-6 inline-block text-sm text-primary underline underline-offset-2">Manage email preferences</Link>
      </div>
    </main>
    </div>
  )
}
