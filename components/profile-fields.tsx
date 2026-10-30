'use client'

import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Year of birth (required) + home postcode (optional). The full date is never collected. */
export function ProfileFields({ birthYear, homePostcode, onBirthYear, onPostcode, idPrefix = 'pf', showNote = true }: {
  birthYear: string; homePostcode: string; onBirthYear: (v: string) => void; onPostcode: (v: string) => void; idPrefix?: string; showNote?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-year`}>Year of birth</Label>
          <Input id={`${idPrefix}-year`} inputMode="numeric" autoComplete="bday-year" required minLength={4} maxLength={4} pattern="\d{4}" placeholder="YYYY" value={birthYear}
            onChange={(e) => onBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-11 w-full min-w-0" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-pc`}>Postcode <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id={`${idPrefix}-pc`} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="4 digits" value={homePostcode}
            onChange={(e) => onPostcode(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-11 w-full min-w-0" />
        </div>
      </div>
      {showNote && <p className="text-xs text-muted-foreground leading-relaxed">
        We only keep the year, not the day. Under-18s are left out of organiser insights. Organisers never see your year or postcode, and any group under 10 people stays hidden. <Link href="/privacy#audience" target="_blank" className="underline hover:text-foreground">Privacy policy</Link>
      </p>}
    </div>
  )
}
