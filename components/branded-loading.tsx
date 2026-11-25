import { VibePeepMascot } from '@/components/vibepeep-mascot'

/** Signed-in waits use the mascot, not a bare spinner. */
export function BrandedLoading({ label = 'One moment' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center" role="status">
      <VibePeepMascot className="w-24" alt="" />
      <p className="font-display text-h3">{label}</p>
    </div>
  )
}
