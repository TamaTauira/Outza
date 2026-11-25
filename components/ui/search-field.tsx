'use client'

import type { ReactNode } from 'react'
import { SearchBar } from '@/components/search-bar'

/** Board and map search. Same bar as the hero, at the 44px control height, with no submit button. */
export function SearchField({
  id = 'vp-search-field',
  value,
  onChange,
  placeholder,
  label,
  onClear,
  list,
  trailing,
  soft = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  onClear?: () => void
  list?: string
  trailing?: ReactNode
  soft?: boolean
}) {
  return (
    <SearchBar
      id={id}
      value={value}
      onChange={onChange}
      onSubmit={(event) => event.preventDefault()}
      placeholder={placeholder}
      label={label}
      icon="search"
      size="md"
      tone="theme"
      hideSubmit
      list={list}
      onClear={onClear && value ? onClear : undefined}
      trailing={trailing}
      className={soft ? 'bg-muted shadow-none ring-0' : undefined}
    />
  )
}
