import { BRAND_ICON_SIZE, BRAND_ICON_SRC } from '@/lib/brand'

type Tone = 'auto' | 'on-light' | 'on-dark'

/** Cream from the supplied sheet, so the black squircle stays visible on a dark page. */
const PLATE = 'bg-[#FBF8F3]'

/** App icon cropped from the supplied artwork. */
export function VibePeepMark({ className = 'w-10 h-10', decorative = false, tone = 'auto' }: { className?: string; decorative?: boolean; tone?: Tone }) {
  const plate = tone === 'on-dark' ? PLATE : tone === 'on-light' ? '' : 'dark:bg-[#FBF8F3]'
  return (
    <span className={`inline-flex shrink-0 ${plate} ${className}`}>
      <img
        src={BRAND_ICON_SRC}
        alt={decorative ? '' : 'VibePeep'}
        width={BRAND_ICON_SIZE}
        height={BRAND_ICON_SIZE}
        draggable={false}
        className="h-full w-full select-none"
      />
    </span>
  )
}
