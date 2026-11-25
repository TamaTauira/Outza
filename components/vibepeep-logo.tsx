import { Logo, type LogoSize, type LogoTone } from '@/components/logo'

export { Logo, LogoHomeLink, LOGO_WIDTH, LOGO_HEIGHT } from '@/components/logo'
export type { LogoSize, LogoTone } from '@/components/logo'

/** Older call sites. The tagline is no longer part of the lockup. */
export function VibePeepLogo({
  size = 'md',
  className = '',
  tone = 'auto',
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  labelClassName?: string
  showTagline?: boolean
  tone?: LogoTone
}) {
  const slot: LogoSize = size === 'sm' ? 'sm' : 'md'
  return <Logo size={slot} tone={tone} className={className} />
}
