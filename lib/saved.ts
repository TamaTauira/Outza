'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { isPastEvent } from '@/lib/seo'
import { LEGACY_REMOVED_KEY, LEGACY_SAVED_KEY, pendingStorageKey, savedStorageKey, savesToUpload } from '@/lib/saved-scope'

export interface SavedEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  time: string | null
  endTime: string | null
  /** Set when the source listed no clock time. Ranking uses this with startsAt/endsAt. */
  allDay?: boolean
  startsAt?: string | null
  endsAt?: string | null
  venueName: string
  suburb: string | null
  category: string
  subTags: string[]
  isLGBTI: boolean
  isFree: boolean
  price: string | null
  priceMin?: number | null
  priceMax?: number | null
  venueAddress?: string | null
  ticketUrl: string | null
  updatedAt?: string
  city?: string
  latitude?: number | null
  longitude?: number | null
  promoTier?: string | null
  friendsGoing?: string[]
  status?: string | null
  statusSource?: string | null
  source?: string | null
  verified?: boolean
  lastVerifiedAt?: string | null
  organiserUrl?: string | null
  confidenceLevel?: 'high' | 'medium' | 'low'
  /** Detail link for non-board items (e.g. VibePeep Local listings); defaults to the event page. */
  href?: string
}

const EVT = 'sydney-events-saved-change'

interface PendingSave { eventId: string; saved: boolean; snapshot?: SavedEvent }

function purgeLegacy() {
  try {
    localStorage.removeItem(LEGACY_SAVED_KEY)
    localStorage.removeItem(LEGACY_REMOVED_KEY)
  } catch {}
}

function readFor(userId: string): SavedEvent[] {
  const key = savedStorageKey(userId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as SavedEvent[]) : []
    if (!Array.isArray(list)) return []
    const seen = new Set<string>()
    return list.filter((s) => s && typeof s.id === 'string' && !seen.has(s.id) && !!seen.add(s.id))
  } catch {
    return []
  }
}

function readPending(userId: string): PendingSave[] {
  try {
    const v = JSON.parse(localStorage.getItem(pendingStorageKey(userId)) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x.eventId === 'string') : []
  } catch { return [] }
}

function writePending(userId: string, rows: PendingSave[]) {
  try { localStorage.setItem(pendingStorageKey(userId), JSON.stringify(rows.slice(-500))) } catch {}
}

function writeFor(userId: string, list: SavedEvent[]) {
  const key = savedStorageKey(userId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(list))
    window.dispatchEvent(new Event(EVT))
  } catch (err) {
    console.error('Could not save bookmarks:', err)
  }
}

function applyPending(list: SavedEvent[], pending: PendingSave[]): SavedEvent[] {
  let next = list
  for (const p of pending) {
    if (p.saved) {
      if (!next.some((e) => e.id === p.eventId) && p.snapshot) next = [...next, p.snapshot]
    } else {
      next = next.filter((e) => e.id !== p.eventId)
    }
  }
  return next
}

/** The signed-in account, if any. Toggles before this is set are not stored. */
let activeUserId: string | null = null
export function setSavedAccountLinked(v: boolean, userId?: string | null) {
  activeUserId = v ? (userId ?? null) : null
}

function pushToAccount(userId: string, eventId: string, saved: boolean, snapshot?: SavedEvent) {
  const pending = readPending(userId).filter((p) => p.eventId !== eventId)
  pending.push({ eventId, saved, ...(snapshot ? { snapshot } : {}) })
  writePending(userId, pending)
  fetch('/api/me/saved', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, saved }),
  }).then((r) => {
    if (!r.ok) return
    writePending(userId, readPending(userId).filter((p) => p.eventId !== eventId))
  }).catch(() => {})
}

/**
 * Loads this account's saves from the server and replaces the device cache.
 * Does not upload another account's bookmarks. Pending toggles for this account are kept.
 */
export async function syncSavedWithAccount(userId?: string | null) {
  const id = userId ?? activeUserId
  if (!id) return
  purgeLegacy()
  try {
    const r = await fetch('/api/me/saved')
    if (!r.ok) return
    const { events } = (await r.json()) as { events: SavedEvent[] }
    const server = Array.isArray(events) ? events : []
    const pending = readPending(id)
    const uploadIds = savesToUpload(id, pending.map((p) => p.eventId))
    const kept = pending.filter((p) => uploadIds.includes(p.eventId))
    writeFor(id, applyPending(server, kept))
    for (const p of kept) {
      const res = await fetch('/api/me/saved', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: p.eventId, saved: p.saved }),
      }).catch(() => null)
      if (res?.ok) writePending(id, readPending(id).filter((row) => row.eventId !== p.eventId))
    }
  } catch (err) {
    console.error('Saved sync failed:', err)
  }
}

/** This account's saved events. Signed out, the list and the badge stay empty. */
export function useSaved() {
  const router = useRouter()
  const { data, status } = useSession()
  const userId = status === 'authenticated' ? (data?.user?.id ?? null) : null
  const [saved, setSaved] = useState<SavedEvent[]>([])

  useEffect(() => {
    setSavedAccountLinked(!!userId, userId)
    if (!userId) {
      purgeLegacy()
      setSaved([])
      return
    }
    const sync = () => setSaved(readFor(userId).filter((s) => !isPastEvent(s)))
    sync()
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [userId])

  const isSaved = useCallback((id: string) => saved.some((s) => s.id === id), [saved])

  const toggle = useCallback((ev: SavedEvent) => {
    if (!userId) {
      toast('Sign in to save events', {
        action: { label: 'Sign in', onClick: () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`) },
      })
      return
    }
    const list = readFor(userId)
    const exists = list.some((s) => s.id === ev.id)
    const snapshot: SavedEvent = {
      id: ev.id, title: ev.title, description: ev.description, date: ev.date, endDate: ev.endDate,
      time: ev.time, endTime: ev.endTime, venueName: ev.venueName, suburb: ev.suburb, category: ev.category,
      subTags: ev.subTags ?? [], isLGBTI: ev.isLGBTI, isFree: ev.isFree, price: ev.price, ticketUrl: ev.ticketUrl,
      ...(ev.href ? { href: ev.href } : {}),
      ...(ev.city ? { city: ev.city } : {}),
      ...(ev.latitude != null ? { latitude: ev.latitude } : {}),
      ...(ev.longitude != null ? { longitude: ev.longitude } : {}),
      ...(ev.status ? { status: ev.status } : {}),
      ...(ev.statusSource ? { statusSource: ev.statusSource } : {}),
      ...(ev.source ? { source: ev.source } : {}),
      ...(ev.verified ? { verified: true } : {}),
      ...(ev.lastVerifiedAt ? { lastVerifiedAt: ev.lastVerifiedAt } : {}),
      ...(ev.organiserUrl ? { organiserUrl: ev.organiserUrl } : {}),
    }
    writeFor(userId, exists ? list.filter((s) => s.id !== ev.id) : [...list, snapshot])
    pushToAccount(userId, ev.id, !exists, snapshot)
  }, [userId, router])

  return { saved, isSaved, toggle, signedIn: !!userId }
}
