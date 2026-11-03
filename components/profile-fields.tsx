'use client'

import type { FormEvent, KeyboardEvent, ReactNode, Ref } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileDigits } from '@/lib/profile-shared'
import { cn } from '@/lib/utils'

/** Year of birth (required for event-goers) + home postcode (optional). The full date is never collected. */
export function ProfileFields({
  birthYear, homePostcode, onBirthYear, onPostcode, idPrefix = 'pf', showNote = true,
  yearError, postcodeError, onBirthYearBlur, onPostcodeBlur, onEnter, yearRequired = true, yearRef, postcodeRef,
}: {
  birthYear: string
  homePostcode: string
  onBirthYear: (v: string) => void
  onPostcode: (v: string) => void
  idPrefix?: string
  showNote?: boolean
  yearError?: string
  postcodeError?: string
  onBirthYearBlur?: () => void
  onPostcodeBlur?: () => void
  onEnter?: () => void
  yearRequired?: boolean
  yearRef?: Ref<HTMLInputElement>
  postcodeRef?: Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DigitField
          id={`${idPrefix}-year`}
          name="bday-year"
          label="Year of birth"
          value={birthYear}
          onValue={onBirthYear}
          onBlur={onBirthYearBlur}
          onEnter={onEnter}
          error={yearError}
          autoComplete="bday-year"
          placeholder="YYYY"
          required={yearRequired}
          minLength={yearRequired ? 4 : undefined}
          inputRef={yearRef}
        />
        <DigitField
          id={`${idPrefix}-pc`}
          name="postal-code"
          label="Postcode"
          labelExtra={<span className="text-muted-foreground font-normal"> (optional)</span>}
          value={homePostcode}
          onValue={onPostcode}
          onBlur={onPostcodeBlur}
          onEnter={onEnter}
          error={postcodeError}
          autoComplete="postal-code"
          placeholder="4 digits"
          inputRef={postcodeRef}
        />
      </div>
      {showNote && <p className="text-xs text-muted-foreground leading-relaxed">
        We only keep the year, not the day. Under-18s are left out of organiser insights. Organisers never see your year or postcode, and any group under 10 people stays hidden. <Link href="/privacy#audience" target="_blank" className="underline hover:text-foreground">Privacy policy</Link>
      </p>}
    </div>
  )
}

function DigitField({
  id, name, label, labelExtra, value, onValue, onBlur, onEnter, error, autoComplete, placeholder, required, minLength, inputRef,
}: {
  id: string
  name: string
  label: string
  labelExtra?: ReactNode
  value: string
  onValue: (v: string) => void
  onBlur?: () => void
  onEnter?: () => void
  error?: string
  autoComplete: string
  placeholder: string
  required?: boolean
  minLength?: number
  inputRef?: Ref<HTMLInputElement>
}) {
  const errorId = `${id}-error`
  // iOS Safari often skips React's onChange for autofill and the numeric keypad.
  // Reading input, keyup, change and blur keeps the controlled value in step, and
  // writing the filtered value back stops a stale DOM value from looking valid while state is not.
  const sync = (e: FormEvent<HTMLInputElement>) => {
    const next = profileDigits(e.currentTarget.value, 4)
    e.currentTarget.value = next
    onValue(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    sync(e)
    onEnter?.()
  }
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{label}{labelExtra}</Label>
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        required={required}
        minLength={minLength}
        maxLength={4}
        pattern="[0-9]*"
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : false}
        aria-describedby={error ? errorId : undefined}
        variant={error ? 'error' : 'default'}
        onInput={sync}
        onChange={sync}
        onKeyUp={sync}
        onBlur={(e) => { sync(e); onBlur?.() }}
        onKeyDown={onKeyDown}
        className={cn(
          'h-11 w-full min-w-0 text-base',
          // The site focus ring is red. A valid year must not keep that error colour.
          !error && 'hover:border-foreground/30 focus-visible:border-foreground/40 focus-visible:ring-foreground/25',
        )}
      />
      {error ? <p id={errorId} className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}
