'use client'

import { useId, type SVGProps } from 'react'

/**
 * Logo eyes as a nav line icon. Proportions come from the brand icon:
 * the left ball sits in front, the right ball behind, and each pupil
 * keeps the logo's size and upper-right glint.
 */
export function PeepIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '')
  const behind = `peep-behind-${id}`
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
      className={className}
      {...props}
    >
      <defs>
        <mask id={behind} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="7.36" cy="12" r="5.9" fill="#000" />
        </mask>
        <mask id={glint} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="8.43" cy="10.81" r="0.77" fill="#000" />
          <circle cx="17.71" cy="10.81" r="0.77" fill="#000" />
        </mask>
      </defs>
      <circle cx="16.64" cy="12" r="6.9" mask={`url(#${behind})`} />
      <circle cx="7.36" cy="12" r="6.9" />
      <g fill="currentColor" stroke="none" mask={`url(#${glint})`}>
        <circle cx="16.64" cy="12" r="2.74" />
        <circle cx="7.36" cy="12" r="2.74" />
      </g>
    </svg>
  )
}
