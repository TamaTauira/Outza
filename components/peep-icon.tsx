import type { SVGProps } from 'react'

/** Two mascot eyes, sized to the same box and stroke as the other nav icons. */
export function PeepIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
      <circle cx="6.75" cy="12" r="5.6" />
      <circle cx="17.25" cy="12" r="5.6" />
      <circle cx="7.9" cy="11.15" r="2.15" fill="currentColor" stroke="none" />
      <circle cx="18.4" cy="11.15" r="2.15" fill="currentColor" stroke="none" />
    </svg>
  )
}
