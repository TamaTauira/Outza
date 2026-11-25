/** Public profiles. The footer and the Organization sameAs graph use this list, in this order. */
export const SITE_SOCIAL = [
  { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/vibe.peep' },
  { id: 'tiktok', label: 'TikTok', href: 'https://www.tiktok.com/@vibe.peep' },
  { id: 'threads', label: 'Threads', href: 'https://www.threads.com/@vibe.peep' },
  { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@vibepeep' },
  { id: 'x', label: 'X', href: 'https://x.com/vibepeepau' },
  { id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61596638167228' },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/vibepeep' },
] as const

export type SocialId = (typeof SITE_SOCIAL)[number]['id']

/** schema.org Organization sameAs, same order and URLs as the footer. */
export const SITE_SAME_AS: readonly string[] = SITE_SOCIAL.map((item) => item.href)
