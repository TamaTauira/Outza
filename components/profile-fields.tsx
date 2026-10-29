'use client'

import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Date of birth (required) + home postcode (optional), with the plain-English collection notice. */
export function ProfileFields({ birthDate, homePostcode, onBirthDate, onPostcode, idPrefix = 'pf', showNote = true }: {
  birthDate: string; homePostcode: string; onBirthDate: (v: string) => void; onPostcode: (v: string) => void; idPrefix?: string; showNote?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-dob`}>Date of birth</Label>
          {/* iOS gives date inputs an intrinsic width; appearance-none + min-w-0 keeps it inside its column */}
          <Input id={`${idPrefix}-dob`} type="date" required min="1900-01-01" value={birthDate} onChange={(e) => onBirthDate(e.target.value)} className="h-11 w-full min-w-0 appearance-none text-left [&::-webkit-date-and-time-value]:text-left" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${idPrefix}-pc`}>Postcode <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id={`${idPrefix}-pc`} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="4 digits" value={homePostcode}
            onChange={(e) => onPostcode(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-11 w-full min-w-0" />
        </div>
      </div>
      {showNote && <p className="text-xs text-muted-foreground leading-relaxed">
        Organisers only ever get grouped stats from these, like &ldquo;35% are 25&ndash;34&rdquo;. They never see your age, birthday or postcode, and any group under 10 people stays hidden. <Link href="/privacy#audience" target="_blank" className="underline hover:text-foreground">Privacy policy</Link>
      </p>}
    </div>
  )
}
