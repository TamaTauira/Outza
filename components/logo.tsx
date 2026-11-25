import { cn } from '@/lib/utils'

/** 1× slot. The files are @2× and @3× of this box (icon height 40, width from the artwork). */
export const LOGO_WIDTH = 154
export const LOGO_HEIGHT = 40

const LIGHT_2 = '/brand/vibepeep-lockup@2x'
const LIGHT_3 = '/brand/vibepeep-lockup@3x'
const DARK_2 = '/brand/vibepeep-lockup-dark@2x'
const DARK_3 = '/brand/vibepeep-lockup-dark@3x'

export type LogoSize = 'md' | 'sm'
export type LogoTone = 'auto' | 'on-light' | 'on-dark'

function Lockup({
  light,
  alt,
}: {
  light: boolean
  alt: string
}) {
  const base = light ? LIGHT_2 : DARK_2
  const hi = light ? LIGHT_3 : DARK_3
  const webp = `${base}.webp 2x, ${hi}.webp 3x`
  const png = `${base}.png 2x, ${hi}.png 3x`
  return (
    <picture className={light ? 'vp-logo-light' : 'vp-logo-dark'}>
      <source type="image/webp" srcSet={webp} />
      <img
        src={`${base}.png`}
        srcSet={png}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        draggable={false}
        className="h-full w-auto max-w-none select-none"
      />
    </picture>
  )
}

/**
 * Icon tile plus the VibePeep wordmark, cut from the artwork. No tagline.
 * md is the header (40px). sm is the footer, sidebar and admin (32px).
 */
export function Logo({
  size = 'md',
  tone = 'auto',
  decorative = false,
  className = '',
}: {
  size?: LogoSize
  tone?: LogoTone
  decorative?: boolean
  className?: string
}) {
  const alt = decorative ? '' : 'VibePeep'
  return (
    <span className={cn('vp-logo', size === 'sm' ? 'vp-logo-sm' : 'vp-logo-md', tone === 'on-dark' && 'is-on-dark', tone === 'on-light' && 'is-on-light', className)}>
      <Lockup light alt={alt} />
      <Lockup light={false} alt={alt} />
    </span>
  )
}

/** The whole lockup is the home link. The name lives on the link, not the image. */
export function LogoHomeLink({
  size = 'md',
  tone = 'auto',
  className = '',
}: {
  size?: LogoSize
  tone?: LogoTone
  className?: string
}) {
  return (
    // Full navigation, same as the previous bar, so the logo clears client state.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/" aria-label="VibePeep home" className={cn('vp-logo-link', className)}>
      <Logo size={size} tone={tone} decorative />
    </a>
  )
}
