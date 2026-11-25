'use client'

import { forwardRef, useId, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRight, Loader2, Search, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { COPY } from '@/lib/copy'
import { cn } from '@/lib/utils'

type SearchBarProps = {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  action?: string
  placeholder: string
  label: string
  submitLabel?: string
  icon?: 'search' | 'spark'
  /** Filters button or any control that sits before submit. */
  trailing?: ReactNode
  hidden?: { name: string; value: string }[]
  busy?: boolean
  hideSubmit?: boolean
  onClear?: () => void
  describedBy?: string
  list?: string
  onFocus?: () => void
  onClick?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  maxLength?: number
  className?: string
  /** Inside a parent card. The bar itself stays the same radius and height. */
  embedded?: boolean
  size?: 'md' | 'lg'
  /** `light` is the white hero bar. `theme` follows the page surface (board and map). */
  tone?: 'light' | 'theme'
}

/**
 * One search box. Home, Ask, /search, Local, the board and the map all use it.
 * Radius is the hero token. The submit label is one string.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onSubmit,
  action,
  placeholder,
  label,
  submitLabel = COPY.search,
  icon = 'search',
  trailing,
  hidden,
  busy = false,
  hideSubmit = false,
  onClear,
  describedBy,
  list,
  onFocus,
  onClick,
  onKeyDown,
  maxLength = 200,
  className,
  embedded = false,
  size = 'lg',
  tone = 'light',
}, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const Icon = icon === 'spark' ? Sparkles : Search
  const showClear = !!onClear && !!value
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!action) event.preventDefault()
    onSubmit?.(event)
  }
  return (
    <form
      role="search"
      action={action}
      method={action ? 'get' : undefined}
      onSubmit={submit}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2 pl-4 focus-within:ring-primary max-[380px]:h-auto max-[380px]:py-1.5',
        embedded ? cn('bg-transparent', tone === 'theme' ? 'text-foreground' : 'text-[var(--vp-on-light)]') : cn('rounded-hero shadow-vp-md ring-2 ring-primary/50', tone === 'light' ? 'bg-white text-[var(--vp-on-light)]' : 'bg-card text-foreground ring-border'),
        size === 'lg' ? 'h-control-lg pr-1.5' : 'h-control pr-1',
        className,
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      {hidden?.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <input
        id={inputId}
        ref={ref}
        name={name}
        type="search"
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="search"
        inputMode="search"
        aria-label={label}
        aria-describedby={describedBy}
        list={list}
        placeholder={placeholder}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onChange={onChange ? (event) => onChange(event.target.value.slice(0, maxLength)) : undefined}
        className={cn('h-control min-w-[9rem] flex-1 basis-[9rem] bg-transparent text-base focus:outline-none', tone === 'theme' ? 'text-foreground placeholder:text-muted-foreground' : 'text-[var(--vp-on-light)] placeholder:text-[var(--vp-text-muted)]')}
      />
      {showClear && !busy && (
        <IconButton type="button" variant="ghost" label="Clear search" onClick={onClear} className={tone === 'theme' ? 'text-foreground' : 'text-[var(--vp-on-light)]'}>
          <X className="h-4 w-4" />
        </IconButton>
      )}
      {trailing}
      {!hideSubmit && (
        <Button type="submit" size="icon" disabled={busy} aria-label={submitLabel} className="h-11 w-11 shrink-0 sm:w-auto sm:px-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <>
              <ArrowRight className="h-4 w-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{submitLabel}</span>
            </>
          )}
        </Button>
      )}
    </form>
  )
})

export function SearchBarSlot({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>
}
