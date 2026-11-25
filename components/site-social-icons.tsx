import type { SocialId } from '@/lib/site-social'

/** Small brand marks. Colour comes from currentColor so the hover token can change it. */
export function SocialIcon({ id }: { id: SocialId }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const, className: 'h-5 w-5' }
  if (id === 'instagram') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
        <circle cx="12" cy="12" r="4.1" />
        <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (id === 'tiktok') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M14.2 3.2c.4 2.5 1.8 4.2 4.1 4.5v2.6c-1.4 0-2.7-.4-4-1.2v6.4a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v2.8a2.9 2.9 0 1 0 2 2.8V3.2h2.7z" />
      </svg>
    )
  }
  if (id === 'threads') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9.2 11.6c.6-2.6 2.4-4 4.6-4 2.8 0 4.4 1.8 4.4 4.6 0 4.2-3.2 6.6-7.2 6.6-3.6 0-6-2.4-6-5.8 0-4.2 3.4-7.6 8-7.6 3.4 0 6 1.6 7.2 4" />
        <path d="M9.4 12.2c.5 2 2 3.2 3.8 3.2 2.2 0 3.4-1.3 3.4-3.1" />
      </svg>
    )
  }
  if (id === 'youtube') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M22.2 8.2a2.8 2.8 0 0 0-2-2C18.6 5.8 12 5.8 12 5.8s-6.6 0-8.2.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1.4 12a29 29 0 0 0 .4 3.8 2.8 2.8 0 0 0 2 2c1.6.4 8.2.4 8.2.4s6.6 0 8.2-.4a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .4-3.8 29 29 0 0 0-.4-3.8zM10 15.2V8.8L15.6 12 10 15.2z" />
      </svg>
    )
  }
  if (id === 'x') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
    )
  }
  if (id === 'facebook') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M14.2 8.2h2.4V5.4h-2.4c-2.3 0-3.8 1.5-3.8 3.8v1.6H8.2v2.8h2.2V20h2.8v-6.4h2.3l.4-2.8h-2.7V9.4c0-.7.4-1.2 1-1.2z" />
      </svg>
    )
  }
  return (
    <svg {...common} fill="currentColor">
      <path d="M5.2 4.2a1.9 1.9 0 1 0 .05 3.8 1.9 1.9 0 0 0-.05-3.8zM4 9.1h2.5V20H4V9.1zm4.6 0h2.4v1.5h.04c.33-.63 1.15-1.7 2.7-1.7 2.9 0 3.4 1.9 3.4 4.4V20h-2.5v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V20H8.6V9.1z" />
    </svg>
  )
}
