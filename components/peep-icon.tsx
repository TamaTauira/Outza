import type { SVGProps } from 'react'

/** Two mascot eyes, drawn with the same line weight as the other nav icons. */
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
      <circle cx="7" cy="12" r="3.5" />
      <circle cx="17" cy="12" r="3.5" />
      <circle cx="7.9" cy="11.2" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="17.9" cy="11.2" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  )
}
