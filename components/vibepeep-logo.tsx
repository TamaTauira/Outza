import { BRAND_TAGLINE, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { VibePeepMark } from '@/components/vibepeep-mark'

export const VIBEPEEP_TAGLINE = BRAND_TAGLINE

type Tone = 'auto' | 'on-light' | 'on-dark'

function WordImg({ src, className, decorative }: { src: string; className: string; decorative: boolean }) {
  return (
    <img
      src={src}
      alt={decorative ? '' : 'VibePeep'}
      width={BRAND_WORDMARK_WIDTH}
      height={BRAND_WORDMARK_HEIGHT}
      draggable={false}
      className={`${className} select-none`}
    />
  )
}

/** Wordmark. Light surfaces keep black Vibe; dark surfaces use white Vibe. No plate behind it. */
export function VibePeepWordmark({ className = 'h-7 w-auto', tone = 'auto', decorative = false }: { className?: string; tone?: Tone; decorative?: boolean }) {
  if (tone === 'on-dark') return <WordImg src={BRAND_WORDMARK_DARK_SRC} className={className} decorative={decorative} />
  if (tone === 'on-light') return <WordImg src={BRAND_WORDMARK_SRC} className={className} decorative={decorative} />
  return (
    <span className="inline-flex items-center">
      <WordImg src={BRAND_WORDMARK_SRC} className={`${className} dark:hidden`} decorative={decorative} />
      <WordImg src={BRAND_WORDMARK_DARK_SRC} className={`${className} hidden dark:inline`} decorative={decorative} />
    </span>
  )
}

const SIZES = {
  sm: { mark: 'w-8 h-8', word: 'h-[22px] w-auto', tag: 'text-[10px]' },
  md: { mark: 'w-10 h-10', word: 'h-7 w-auto', tag: 'text-[11px]' },
  lg: { mark: 'w-11 h-11', word: 'h-8 w-auto', tag: 'text-xs' },
} as const

/** Brand lockup: icon, wordmark, and the tagline. */
export function VibePeepLogo({
  size = 'md',
  className = '',
  labelClassName = 'flex',
  showTagline = true,
  tone = 'auto',
}: {
  size?: keyof typeof SIZES
  className?: string
  labelClassName?: string
  showTagline?: boolean
  tone?: Tone
}) {
  const s = SIZES[size]
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} role="img" aria-label={showTagline ? `VibePeep. ${BRAND_TAGLINE}` : 'VibePeep'}>
      <VibePeepMark className={s.mark} decorative />
      <span className={`${labelClassName} min-w-0 flex-col leading-none text-left`} aria-hidden>
        <VibePeepWordmark className={s.word} decorative tone={tone} />
        {showTagline && (
          <span className={`mt-1 max-w-[15rem] font-medium leading-tight text-muted-foreground ${s.tag}`}>{BRAND_TAGLINE}</span>
        )}
      </span>
    </span>
  )
}
