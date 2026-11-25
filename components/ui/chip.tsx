import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean
  /** On a photo or dark hero, not inside the white search bar. */
  onDark?: boolean
  /** Inside the white Ask bar, so the label stays dark in either theme. */
  onLight?: boolean
  children: ReactNode
}

/** Class for a chip that has to be a link. Pressed is brand orange with near-black ink. */
export function chipClass(pressed = false) {
  return cn(
    'inline-flex h-control min-h-control max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    pressed ? 'bg-primary text-on-primary' : 'border border-border bg-card text-foreground hover:bg-muted',
  )
}

/** 44px pill. Pressed is brand orange with near-black ink. Tokens, not neutral greys. */
export function Chip({ pressed = false, onDark = false, onLight = false, className, children, type = 'button', ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(chipClass(pressed), onDark && !pressed && 'border-transparent bg-white/15 text-white hover:bg-white/25', onLight && !pressed && 'border-transparent bg-[var(--vp-on-light-fill)] text-[var(--vp-on-light)] hover:bg-[var(--vp-on-light-fill-hover)]', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function ChipGroup({
  label,
  icon,
  children,
  className,
  onLight = false,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
  className?: string
  onLight?: boolean
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('vp-eyebrow mb-2 flex items-center gap-1.5', onLight ? 'text-[var(--vp-on-light)]' : 'text-muted-foreground')}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
