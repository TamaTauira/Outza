import { useId } from 'react'

/**
 * Canonical brand tile: black rounded square, orange and pink eyes.
 * Inlined so gradient and mask ids stay on this element. The same artwork as an
 * <img> drops its mask on pages that also load a map, and the tile paints as a
 * plain pink square. One mark, both themes.
 */
export function VibePeepMark({ className = 'w-10 h-10', decorative = false }: { className?: string; decorative?: boolean }) {
  const raw = useId().replace(/:/g, '')
  const rings = `vp-icon-rings-${raw}`
  const pink = `vp-icon-pink-${raw}`
  const orange = `vp-icon-orange-${raw}`
  const gloss = `vp-icon-gloss-${raw}`
  const pupil = `vp-icon-pupil-${raw}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width="512"
      height="512"
      fill="none"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'VibePeep'}
      className={`inline-block shrink-0 select-none ${className}`}
    >
      <rect width="512" height="512" rx="116" fill="#111111" />
      <rect x="2.5" y="2.5" width="507" height="507" rx="113.5" fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="2" />
      <defs>
        <mask id={rings} maskUnits="userSpaceOnUse">
          <rect width="512" height="512" fill="#000" />
          <circle cx="178" cy="256" r="116" fill="#fff" />
          <circle cx="334" cy="256" r="116" fill="#fff" />
          <circle cx="178" cy="256" r="70" fill="#000" />
          <circle cx="334" cy="256" r="70" fill="#000" />
        </mask>
        <linearGradient id={pink} x1="300" y1="150" x2="460" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFA3BE" />
          <stop offset="0.42" stopColor="#FF5C8A" />
          <stop offset="1" stopColor="#FF3A72" />
        </linearGradient>
        <linearGradient id={orange} x1="70" y1="140" x2="280" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC56A" />
          <stop offset="0.45" stopColor="#FF8C22" />
          <stop offset="1" stopColor="#F06412" />
        </linearGradient>
        <linearGradient id={gloss} x1="256" y1="140" x2="256" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={pupil} cx="38%" cy="34%" r="68%">
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="0.55" stopColor="#141414" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
      </defs>
      <circle cx="178" cy="256" r="72" fill="#fff" />
      <circle cx="334" cy="256" r="72" fill="#fff" />
      <g mask={`url(#${rings})`}>
        <rect width="512" height="512" fill={`url(#${pink})`} />
        <circle cx="178" cy="256" r="116" fill={`url(#${orange})`} />
        <rect width="512" height="250" fill={`url(#${gloss})`} />
      </g>
      <circle cx="178" cy="258" r="46" fill={`url(#${pupil})`} />
      <circle cx="334" cy="258" r="46" fill={`url(#${pupil})`} />
      <ellipse cx="196" cy="238" rx="13" ry="16" fill="#fff" />
      <ellipse cx="352" cy="238" rx="13" ry="16" fill="#fff" />
      <ellipse cx="160" cy="276" rx="5.5" ry="6.5" fill="#fff" />
      <ellipse cx="316" cy="276" rx="5.5" ry="6.5" fill="#fff" />
    </svg>
  )
}
