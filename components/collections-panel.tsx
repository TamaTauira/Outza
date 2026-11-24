'use client'

import { useState, useSyncExternalStore } from 'react'
import { FolderPlus, Link2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/surface'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { COPY } from '@/lib/copy'
import { decodeCollectionLink, encodeCollectionLink, useCollections, type Collection, type CollectionEvent } from '@/lib/collections'
import { eventToItem, useItinerary } from '@/lib/itinerary'
import { notifyAddedToItinerary } from '@/lib/notify'

const SAMPLES = [
  { name: 'Date nights', detail: 'Two stops, one evening.' },
  { name: 'With the kids', detail: 'Sunday, out of the house.' },
  { name: 'Free weekends', detail: 'The good stuff that costs nothing.' },
]

export function collectionEventFrom(ev: {
  id: string
  title: string
  date: string
  time?: string | null
  venueName: string
  suburb?: string | null
  city?: string | null
  category?: string | null
  imageUrl?: string | null
  isFree?: boolean
  price?: string | null
  href?: string | null
}): CollectionEvent {
  return {
    id: ev.id,
    title: ev.title,
    date: ev.date.slice(0, 10),
    time: ev.time ?? null,
    venueName: ev.venueName,
    suburb: ev.suburb ?? null,
    city: ev.city ?? null,
    category: ev.category ?? null,
    imageUrl: ev.imageUrl ?? null,
    isFree: ev.isFree,
    price: ev.price ?? null,
    href: ev.href ?? null,
  }
}

/** Named lists of saved events. Stored on this device. A share link carries the list, not an account. */
export function CollectionsPanel() {
  const { collections, create, rename, remove, moveEvent, removeEvent } = useCollections()
  const itinerary = useItinerary()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [hideShared, setHideShared] = useState(false)
  const sharedToken = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get('collection') ?? '',
    () => '',
  )
  const incoming = hideShared || !sharedToken ? null : decodeCollectionLink(sharedToken)

  const make = () => {
    const created = create(draft)
    if (!created) return
    setDraft('')
    toast.success(`Collection “${created.name}” is ready`)
  }

  const share = async (collection: Collection) => {
    const url = `${window.location.origin}/saved?collection=${encodeCollectionLink(collection)}`
    try {
      if (navigator.share) {
        await navigator.share({ title: collection.name, url })
        return
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Collection link copied')
    } catch {
      toast(url)
    }
  }

  const addAll = (collection: Collection) => {
    let added = 0
    for (const event of collection.events) {
      if (itinerary.has(event.id)) continue
      itinerary.add(eventToItem({ ...event, venueName: event.venueName }))
      added += 1
    }
    if (added) notifyAddedToItinerary(added)
    else toast('Those stops are already on your Itinerary')
  }

  return (
    <section className="mt-section" aria-labelledby="collections-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="collections-title" className="font-display text-h3">Collections</h2>
          <p className="mt-1 text-sm text-muted-foreground">Group the keepers. Date nights, kids, free weekends. They stay on this device.</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); make() }}>
          <label className="sr-only" htmlFor="new-collection">Collection name</label>
          <input id="new-collection" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} placeholder="Name a collection" className="h-control min-w-0 flex-1 rounded-control border border-border bg-background px-3 text-base sm:w-56" />
          <Button type="submit" size="md"><FolderPlus className="h-4 w-4" aria-hidden /> Create</Button>
        </form>
      </div>

      {incoming && (
        <Surface pad="md" className="mt-hero flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="vp-eyebrow text-muted-foreground">Shared collection</p>
            <h3 className="mt-1 font-display text-h3">{incoming.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{incoming.events.length} {incoming.events.length === 1 ? 'event' : 'events'} in this link.</p>
          </div>
          <Button type="button" size="md" onClick={() => { create(incoming.name, incoming.events); setHideShared(true); toast.success('Collection saved on this device') }}>Save collection</Button>
        </Surface>
      )}

      {collections.length === 0 ? (
        <div className="mt-hero grid gap-card sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <Surface key={sample.name} pad="md" className="flex h-full flex-col">
              <VibePeepMascot className="h-16 w-16" alt="" />
              <p className="vp-eyebrow mt-3 text-muted-foreground">Example</p>
              <h3 className="mt-1 font-display text-h3">{sample.name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{sample.detail}</p>
            </Surface>
          ))}
        </div>
      ) : (
        <div className="mt-hero grid gap-card sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => {
            const cover = collection.events.find((event) => event.imageUrl)?.imageUrl
            return (
              <Surface key={collection.id} pad="md" className="flex h-full flex-col">
                <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-muted">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <VibePeepMascot className="absolute inset-0 m-auto h-20 w-20" alt="" />
                  )}
                </div>
                {editing === collection.id ? (
                  <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); rename(collection.id, name); setEditing(null) }}>
                    <label className="sr-only" htmlFor={`rename-${collection.id}`}>Rename {collection.name}</label>
                    <input id={`rename-${collection.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="h-control min-w-0 flex-1 rounded-control border border-border bg-background px-3 text-base" />
                    <Button type="submit" size="md">Save</Button>
                  </form>
                ) : (
                  <h3 className="mt-3 font-display text-h3 leading-tight">{collection.name}</h3>
                )}
                <p className="mt-1 text-sm text-muted-foreground">{collection.events.length} {collection.events.length === 1 ? 'event' : 'events'}</p>
                {collection.events.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {collection.events.slice(0, 3).map((event) => (
                      <li key={event.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{event.title}</span>
                        <span className="flex shrink-0 items-center">
                          {collections.length > 1 && (
                            <select aria-label={`Move ${event.title}`} className="h-control bg-transparent text-sm" defaultValue="" onChange={(item) => { if (item.target.value) moveEvent(collection.id, item.target.value, event.id) }}>
                              <option value="">Move</option>
                              {collections.filter((other) => other.id !== collection.id).map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
                            </select>
                          )}
                          <button type="button" className="inline-flex h-control items-center px-2 text-sm font-semibold" onClick={() => removeEvent(collection.id, event.id)}>Remove</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <Button type="button" size="md" variant="outline" onClick={() => { setEditing(collection.id); setName(collection.name) }}><Pencil className="h-4 w-4" aria-hidden /> Rename</Button>
                  <Button type="button" size="md" variant="outline" onClick={() => { void share(collection) }}><Link2 className="h-4 w-4" aria-hidden /> Share</Button>
                  <Button type="button" size="md" disabled={!collection.events.length} onClick={() => addAll(collection)}>{COPY.addToItinerary}</Button>
                  <Button type="button" size="md" variant="ghost" onClick={() => remove(collection.id)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</Button>
                </div>
              </Surface>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function AddToCollection({ event }: { event: CollectionEvent }) {
  const { collections, addEvent, create } = useCollections()
  if (!collections.length) {
    return (
      <Button type="button" size="md" variant="outline" onClick={() => create('Date nights', [event])}>
        Start a collection
      </Button>
    )
  }
  return (
    <label className="inline-flex h-control items-center gap-2 rounded-full border border-border px-3 text-sm font-semibold">
      <span className="sr-only">Add {event.title} to a collection</span>
      <select
        className="h-control bg-transparent text-sm font-semibold focus:outline-none"
        value=""
        onChange={(item) => {
          if (!item.target.value) return
          addEvent(item.target.value, event)
          toast.success('Added to the collection')
          item.target.value = ''
        }}
      >
        <option value="">Add to collection</option>
        {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
      </select>
    </label>
  )
}
