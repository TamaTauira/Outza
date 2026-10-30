'use client'

export function VenueLinks({ id, website, destination }: { id: string; website?: string | null; destination: string }) {
  const ping = (kind: string) => {
    fetch(`/api/venues/${id}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) }).catch(() => {})
  }
  return (
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
      {website && <a href={website} target="_blank" rel="noopener noreferrer" className="underline" onClick={() => ping('website')}>Website</a>}
      <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noopener noreferrer" className="underline" onClick={() => ping('directions')}>Directions</a>
    </div>
  )
}
