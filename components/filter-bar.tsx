import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SearchField } from '@/components/ui/search-field'

/** Date chips and the search field share one height, radius and gap on every page. */
export function filterChipClass(pressed: boolean) {
  return cn(
    'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold',
    pressed ? 'bg-primary text-[#1a1408]' : 'border border-border bg-background text-foreground hover:bg-muted',
  )
}

export function FilterBar({
  dates,
  picker,
  searchId,
  searchValue,
  onSearch,
  onClear,
  searchPlaceholder,
  searchLabel,
  searchList,
  searchExtra,
  children,
}: {
  dates: { key: string; label: string; pressed: boolean; onClick: () => void }[]
  picker?: ReactNode
  searchId: string
  searchValue: string
  onSearch: (value: string) => void
  onClear: () => void
  searchPlaceholder: string
  searchLabel: string
  searchList?: string
  searchExtra?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="px-3 sm:px-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] lg:shrink-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="When">
          {dates.map((chip) => (
            <button key={chip.key} type="button" aria-pressed={chip.pressed} onClick={chip.onClick} className={filterChipClass(chip.pressed)}>
              {chip.label}
            </button>
          ))}
          {picker}
        </div>
        <div className="min-w-0 flex-1">
          <SearchField
            id={searchId}
            soft
            value={searchValue}
            onChange={onSearch}
            onClear={onClear}
            placeholder={searchPlaceholder}
            label={searchLabel}
            list={searchList}
          />
          {searchExtra}
        </div>
      </div>
      {children ? (
        <div className="mt-2 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      ) : null}
    </div>
  )
}
