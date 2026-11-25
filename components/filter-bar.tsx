import type { ReactNode } from 'react'
import { Chip, chipClass } from '@/components/ui/chip'
import { SearchField } from '@/components/ui/search-field'

/** Date chips and the search field share one height, radius and gap on every page. */
export function filterChipClass(pressed: boolean) {
  return chipClass(pressed)
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
        <div className="flex flex-wrap gap-2 lg:shrink-0" role="group" aria-label="When">
          {dates.map((chip) => (
            <Chip key={chip.key} pressed={chip.pressed} onClick={chip.onClick}>{chip.label}</Chip>
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
