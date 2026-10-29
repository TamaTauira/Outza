import { BRAND_TAGLINE, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { VibePeepMark } from '@/components/vibepeep-mark'

export const VIBEPEEP_TAGLINE = BRAND_TAGLINE

type Tone = 'auto' | 'on-light' | 'on-dark'

/** The supplied wordmark is black + gradient. On dark surfaces it sits on the sheet's cream. */
const PLATE = 'rounded-md bg-[#FBF8F3] px-1.5 py-0.5'
const PLATE_DARK = 'dark:rounded-md dark:bg-[#FBF8F3] dark:px-1.5 dark:py-0.5'

/** Wordmark cropped from the supplied artwork: black Vibe, orange-to-pink Peep. */
export function VibePeepWordmark({ className = 'h-7 w-auto', tone = 'auto', decorative = false }: { className?: string; tone?: Tone; decorative?: boolean }) {
  const plate = tone === 'on-dark' ? PLATE : tone === 'on-light' ? '' : PLATE_DARK
  return (
    <span className={`inline-flex items-center ${plate}`}>
      <img
        src={BRAND_WORDMARK_SRC}
        alt={decorative ? '' : 'VibePeep'}
        width={BRAND_WORDMARK_WIDTH}
        height={BRAND_WORDMARK_HEIGHT}
        draggable={false}
        className={`${className} select-none`}
      />
    </span>
  )
}

const SIZES = {
  sm: { mark: 'w-8 h-8', word: 'h-[22px] w-auto', tag: 'text-[10px]' },
  md: { mark: 'w-10 h-10', word: 'h-7 w-auto', tag: 'text-[11px]' },
  lg: { mark: 'w-11 h-11', word: 'h-8 w-auto', tag: 'text-xs' },
} as const

/** Brand lockup: supplied icon, supplied wordmark, and the tagline. */
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
      <VibePeepMark className={s.mark} decorative tone={tone} />
      <span className={`${labelClassName} min-w-0 flex-col leading-none text-left`} aria-hidden>
        <VibePeepWordmark className={s.word} decorative tone={tone} />
        {showTagline && (
          <span className={`mt-1 max-w-[15rem] font-medium leading-tight text-muted-foreground ${s.tag}`}>{BRAND_TAGLINE}</span>
        )}
      </span>
    </span>
  )
}
