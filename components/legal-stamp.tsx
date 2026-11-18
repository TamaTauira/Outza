import Link from 'next/link'
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal-docs'

export function LegalStamp({ doc }: { doc: LegalDocId }) {
  const item = LEGAL_DOCS[doc]
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      Last updated {item.updated}. Version {item.version}.{' '}
      <Link href="/legal/archive" className="underline underline-offset-2 hover:text-foreground">Earlier versions</Link>
    </p>
  )
}
