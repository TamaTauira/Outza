'use client'

import Link from 'next/link'
import { PROMOTER_TERMS_VERSION } from '@/lib/legal-docs'

export function PromoterTermsCheck({ id, checked, onChange }: { id: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input id={id} name={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <span>
        I agree to the <Link href="/terms/promoters" className="underline underline-offset-2" target="_blank">Promoter Terms</Link> (version {PROMOTER_TERMS_VERSION}).
      </span>
    </label>
  )
}
