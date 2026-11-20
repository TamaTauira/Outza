import { BRAND_TAGLINE, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_WIDTH } from '@/lib/brand'

/** Vector wordmark. The PNG twins in lib/brand stay for email clients that drop SVG. */
const WORDMARK_SVG = '/vibepeep-wordmark.svg'
const WORDMARK_SVG_DARK = '/vibepeep-wordmark-ondark.svg'
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
export function VibePeepWordmark({ className = '', tone = 'auto', decorative = false }: { className?: string; tone?: Tone; decorative?: boolean }) {
  const plate = (src: string, extra = '') => (
    <WordImg src={src} className={`h-full w-auto ${extra}`} decorative={decorative} />
  )
  if (tone === 'on-dark') return <span className={className}>{plate(WORDMARK_SVG_DARK)}</span>
  if (tone === 'on-light') return <span className={className}>{plate(WORDMARK_SVG)}</span>
  return (
    <span className={className}>
      {plate(WORDMARK_SVG, 'dark:hidden')}
      {plate(WORDMARK_SVG_DARK, 'hidden dark:block')}
    </span>
  )
}

const MARK = { sm: '2rem', md: '2.5rem', lg: '2.75rem' } as const

/**
 * Icon plus wordmark and tagline. The text block is exactly the icon’s height:
 * the wordmark’s cap top meets the icon’s top, and the tagline’s baseline meets its bottom.
 * Narrow slots drop the tagline and centre the wordmark on the icon.
 */
export function VibePeepLogo({
  size = 'md',
  className = '',
  showTagline = true,
  tone = 'auto',
}: {
  size?: keyof typeof MARK
  className?: string
  labelClassName?: string
  showTagline?: boolean
  tone?: Tone
}) {
  return (
    <span className={`vp-lockup-slot ${className}`}>
      <span className={`vp-lockup${showTagline ? '' : ' is-compact'}`} style={{ fontSize: MARK[size] }} role="img" aria-label={showTagline ? `VibePeep. ${BRAND_TAGLINE}` : 'VibePeep'}>
        <VibePeepMark className="vp-lockup-mark" decorative />
        <span className="vp-lockup-copy" aria-hidden>
          <VibePeepWordmark className="vp-lockup-word" decorative tone={tone} />
          {showTagline && <span className="vp-lockup-tag">{BRAND_TAGLINE}</span>}
        </span>
      </span>
    </span>
  )
}
