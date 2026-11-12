'use client'

import { useId, type SVGProps } from 'react'

/** Version C: same eye size, circles spaced halfway between A and B so they just kiss. */
export function PeepIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '')
  const glint = `peep-glint-${id}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
      className={className}
      {...props}
    >
      <defs>
        <mask id={glint} maskUnits="userSpaceOnUse">
          <rect x="-8" y="-8" width="40" height="40" fill="#fff" />
          <circle cx="5.67" cy="10.81" r="0.77" fill="#000" />
          <circle cx="20.47" cy="10.81" r="0.77" fill="#000" />
        </mask>
      </defs>
      <circle cx="19.4" cy="12" r="6.9" />
      <circle cx="4.6" cy="12" r="6.9" />
      <g fill="currentColor" stroke="none" mask={`url(#${glint})`}>
        <circle cx="19.4" cy="12" r="2.74" />
        <circle cx="4.6" cy="12" r="2.74" />
      </g>
    </svg>
  )
}
