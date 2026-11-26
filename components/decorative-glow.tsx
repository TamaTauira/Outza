import { cn } from '@/lib/utils'

/**
 * A blurred wash that cannot paint past its own box.
 * The clip (overflow + contain: paint) lives on this element, so a later
 * parent with overflow: visible cannot let the blur spill to the viewport edge.
 * Do not move the backdrop-filter onto an ancestor that is only overflow: clip.
 */
export function DecorativeGlow({ className }: { className?: string }) {
  return (
    <div className={cn('vp-decorative-glow', className)} aria-hidden>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />
    </div>
  )
}
