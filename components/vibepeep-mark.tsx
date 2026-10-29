import { useId } from 'react'

/** App icon: black squircle, two peeking eyes in the orange-to-pink brand gradient. */
export function VibePeepMark({ className = 'w-10 h-10', decorative = false }: { className?: string; decorative?: boolean }) {
  const gid = useId().replace(/:/g, '')
  const orange = `vp-o-${gid}`
  const pink = `vp-p-${gid}`
  const left = `vp-el-${gid}`
  const right = `vp-er-${gid}`
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'VibePeep'} aria-hidden={decorative || undefined}>
      <rect width="64" height="64" rx="14.5" fill="#111111" />
      <defs>
        <linearGradient id={orange} x1="6" y1="12" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFC247" />
          <stop offset="50%" stopColor="#FF8A1A" />
          <stop offset="100%" stopColor="#FF5C00" />
        </linearGradient>
        <linearGradient id={pink} x1="32" y1="12" x2="58" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9B86" />
          <stop offset="48%" stopColor="#FF4E6A" />
          <stop offset="100%" stopColor="#FF3A72" />
        </linearGradient>
        <mask id={left}>
          <circle cx="23.4" cy="36.2" r="5.35" fill="#fff" />
          <circle cx="23.4" cy="32.4" r="3.35" fill="#000" />
        </mask>
        <mask id={right}>
          <circle cx="40.6" cy="36.2" r="5.35" fill="#fff" />
          <circle cx="40.6" cy="32.4" r="3.35" fill="#000" />
        </mask>
      </defs>
      <circle cx="22.6" cy="31.2" r="12.15" fill="none" stroke={`url(#${orange})`} strokeWidth="7.15" />
      <circle cx="41.4" cy="31.2" r="12.15" fill="none" stroke={`url(#${pink})`} strokeWidth="7.15" />
      <circle cx="23.4" cy="36.2" r="5.35" fill="#fff" mask={`url(#${left})`} />
      <circle cx="40.6" cy="36.2" r="5.35" fill="#fff" mask={`url(#${right})`} />
    </svg>
  )
}
