'use client'

import { Button } from '@/components/ui/button'

export function VenueLinks({ id, website, instagram, facebook, phone, destination }: {
  id: string
  website?: string | null
  instagram?: string | null
  facebook?: string | null
  phone?: string | null
  destination: string
}) {
  const ping = (kind: string) => {
    fetch(`/api/venues/${id}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) }).catch(() => {})
  }
  const links = [
    website ? { href: website, label: 'Website', kind: 'website' } : null,
    instagram ? { href: instagram, label: 'Instagram', kind: 'website' } : null,
    facebook ? { href: facebook, label: 'Facebook', kind: 'website' } : null,
    { href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`, label: 'Directions', kind: 'directions' },
  ].filter((item): item is { href: string; label: string; kind: string } => !!item)

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">Links</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.label} asChild variant="outline" size="sm">
            <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => ping(link.kind)}>{link.label}</a>
          </Button>
        ))}
      </div>
      {phone && <a href={`tel:${phone.replace(/\s+/g, '')}`} className="text-sm text-muted-foreground underline">{phone}</a>}
    </div>
  )
}
