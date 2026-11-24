'use client'

import { MapPin } from 'lucide-react'
import { CITIES } from '@/lib/cities'
import { cn } from '@/lib/utils'

/** City select shared by the Home and Local heroes, and the Map toolbar. */
export function CityPicker({
  value,
  onChange,
  onDark = false,
  id,
  label = 'Choose a city',
}: {
  value: string
  onChange: (city: string) => void
  onDark?: boolean
  id?: string
  label?: string
}) {
  return (
    <label className={cn('inline-flex h-control-lg w-full items-center gap-2 rounded-hero px-3', onDark ? 'bg-white/10 text-white' : 'border border-border bg-background shadow-vp-sm')}>
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn('min-w-0 flex-1 cursor-pointer truncate bg-transparent text-base font-medium focus:outline-none', onDark ? 'text-white' : 'text-foreground')}
        aria-label={label}
      >
        {CITIES.map((city) => (
          <option key={city.name} value={city.name} className="bg-popover text-popover-foreground">{city.name}{onDark ? `, ${city.state}` : ''}</option>
        ))}
      </select>
    </label>
  )
}
