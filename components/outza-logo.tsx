import { OutzaMark } from '@/components/outza-mark'

export const OUTZA_TAGLINE = 'Get out. Get amongst it.'

const SIZES = {
  sm: { mark: 'w-9 h-9', word: 'text-sm', tag: 'text-[9px]' },
  md: { mark: 'w-10 h-10', word: 'text-[20px]', tag: 'text-[9px]' },
  lg: { mark: 'w-11 h-11', word: 'text-2xl', tag: 'text-[10px]' },
} as const

/** Brand lockup: mark + OUTZA. wordmark + tagline. Use wherever the logo appears. */
export function OutzaLogo({ size = 'md', className = '', labelClassName = 'flex' }: { size?: keyof typeof SIZES; className?: string; labelClassName?: string }) {
  const s = SIZES[size]
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <OutzaMark className={s.mark} />
      <span className={`${labelClassName} flex-col leading-none text-left`}>
        <span className={`font-display font-extrabold tracking-tight ${s.word}`}>OUTZA<span className="text-primary">.</span></span>
        <span className={`mt-1 font-mono uppercase tracking-[0.18em] text-muted-foreground ${s.tag}`}>{OUTZA_TAGLINE}</span>
      </span>
    </span>
  )
}
