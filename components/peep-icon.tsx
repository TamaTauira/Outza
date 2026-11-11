'use client'

import { useId, type SVGProps } from 'react'

/** Version B: same eye size, two separate circles with a small gap. */
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
          <circle cx="4.37" cy="10.81" r="0.77" fill="#000" />
          <circle cx="21.77" cy="10.81" r="0.77" fill="#000" />
        </mask>
      </defs>
      <circle cx="20.7" cy="12" r="6.9" />
      <circle cx="3.3" cy="12" r="6.9" />
      <g fill="currentColor" stroke="none" mask={`url(#${glint})`}>
        <circle cx="20.7" cy="12" r="2.74" />
        <circle cx="3.3" cy="12" r="2.74" />
      </g>
    </svg>
  )
}
