'use client'

import type { FormEvent, ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Pill search used by the Local hero. The submit is the shared button. */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  submitLabel = 'Search',
  name,
  maxLength = 200,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  label: string
  submitLabel?: string
  name?: string
  maxLength?: number
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form role="search" onSubmit={submit} className="flex h-control-lg min-w-0 items-center gap-2 rounded-full bg-white pl-4 pr-1.5 text-[var(--vp-on-light)] ring-2 ring-primary/50">
      <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <label className="sr-only">{label}</label>
      <input
        name={name}
        type="search"
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="search"
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        className="h-control min-w-0 flex-1 bg-transparent text-base text-[var(--vp-on-light)] placeholder:text-[var(--vp-text-muted)] focus:outline-none"
      />
      <Button type="submit" size="md" className="shrink-0">{submitLabel}</Button>
    </form>
  )
}

export function SearchBarSlot({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>
}
