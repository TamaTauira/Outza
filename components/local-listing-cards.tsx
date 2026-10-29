import Link from 'next/link'
import { MapPin, Repeat } from 'lucide-react'
import { fmtDay, fmtTime, localCategoryShort, localPath } from '@/lib/local-shared'

export type LocalCardItem = {
  id: string; title: string; category: string; description: string; suburb: string; startTime: string; endTime: string
  priceNote: string | null; date: string; schedule: string; recurring: boolean
}

/** Server-rendered, crawlable cards for public VibePeep Local listings on guide pages. */
export function LocalListingCards({ items }: { items: LocalCardItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((l) => (
        <Link key={l.id} href={localPath(l)} className="group rounded-xl bg-card p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{localCategoryShort(l.category)}</span>
          <h3 className="font-display text-lg font-semibold leading-snug group-hover:text-primary transition-colors">{l.title}</h3>
          <p className="text-sm text-muted-foreground">{fmtDay(l.date)} · {fmtTime(l.startTime)}–{fmtTime(l.endTime)}</p>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{l.suburb}</p>
          {l.recurring && <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" />{l.schedule}</p>}
          <p className="text-sm text-muted-foreground line-clamp-2">{l.description}</p>
          {l.priceNote && <p className="text-sm font-medium">{l.priceNote}</p>}
        </Link>
      ))}
    </div>
  )
}
