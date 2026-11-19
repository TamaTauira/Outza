import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'

/** One search field. The list and the map use this, not a one-off input. */
export function SearchField({
  id = 'vp-search-field',
  value,
  onChange,
  placeholder,
  label,
  onClear,
  list,
  trailing,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  onClear?: () => void
  list?: string
  trailing?: ReactNode
}) {
  return (
    <form role="search" className="relative min-w-0" onSubmit={(event) => event.preventDefault()}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden />
      <input
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        list={list}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onClear) onClear()
        }}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-input bg-card pl-12 pr-12 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring md:text-sm"
      />
      {value && onClear && (
        <button type="button" onClick={onClear} aria-label="Clear search" className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
      {trailing}
    </form>
  )
}
