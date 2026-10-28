import Link from 'next/link'
import { verify } from '@/lib/newsletter/links'
import { UnsubscribeClient } from './unsubscribe-client'
import { OutzaLogo } from '@/components/outza-logo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe — Outza' }

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = '', k = '', s = '' } = await searchParams
  const valid = !!u && verify(k, u, 'unsub')
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl bg-card shadow-lg p-8 text-center">
        <Link href="/" aria-label="Outza home" className="inline-flex"><OutzaLogo size="md" /></Link>
        {valid ? (
          <UnsubscribeClient u={u} k={k} s={s} />
        ) : (
          <>
            <h1 className="mt-4 font-display text-2xl font-bold">Link not recognised</h1>
            <p className="mt-2 text-muted-foreground text-sm">This unsubscribe link is invalid. You can turn emails off any time in your account settings.</p>
          </>
        )}
        <Link href="/account" className="mt-6 inline-block text-sm text-primary underline underline-offset-2">Manage email preferences</Link>
      </div>
    </main>
  )
}
