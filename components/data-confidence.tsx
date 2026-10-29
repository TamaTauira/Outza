import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ListingStatus = { label: string; tone: 'bad' | 'warn'; note: string } | null

/** Cancelled / postponed / reported-sold-out banner. Shown only when a source reported that status. */
export function StatusBanner({ status }: { status: ListingStatus }) {
  if (!status) return null
  return (
    <div className={cn('flex items-start gap-3 rounded-lg px-4 py-3 mb-5', status.tone === 'bad' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">{status.label}</p>
        <p className="text-sm opacity-90">{status.note}</p>
      </div>
    </div>
  )
}
