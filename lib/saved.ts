'use client'

import { useCallback, useEffect, useState } from 'react'
import { isPastEvent } from '@/lib/seo'

export interface SavedEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  time: string | null
  endTime: string | null
  venueName: string
  suburb: string | null
  category: string
  subTags: string[]
  isLGBTI: boolean
  isFree: boolean
  price: string | null
  ticketUrl: string | null
  updatedAt?: string
  city?: string
  latitude?: number | null
  longitude?: number | null
  promoTier?: string | null
  friendsGoing?: string[]
  status?: string | null
  statusSource?: string | null
  confidenceLevel?: 'high' | 'medium' | 'low'
  /** Detail link for non-board items (e.g. OUTZA Local listings); defaults to the event page. */
  href?: string
}

const KEY = 'sydney-events-saved-v1'
const EVT = 'sydney-events-saved-change'

// Ids un-saved on this device that the account hasn't confirmed yet, so a later sync can't bring them back.
const REMOVED_KEY = 'sydney-events-saved-removed-v1'

function read(): SavedEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as SavedEvent[]) : []
    if (!Array.isArray(list)) return []
    const seen = new Set<string>()
    return list.filter((s) => s && typeof s.id === 'string' && !seen.has(s.id) && !!seen.add(s.id))
  } catch {
    return []
  }
}

function readRemoved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(REMOVED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}
function writeRemoved(ids: string[]) {
  try { localStorage.setItem(REMOVED_KEY, JSON.stringify([...new Set(ids)].slice(-500))) } catch {}
}

function write(list: SavedEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    window.dispatchEvent(new Event(EVT))
  } catch (err) {
    console.error('Could not save bookmarks:', err)
  }
}

/** Pushes a single save/unsave to the account. Before the account is linked, the change waits on this device for the next sync. */
let accountLinked = false
export function setSavedAccountLinked(v: boolean) { accountLinked = v }

function pushToAccount(eventId: string, saved: boolean) {
  if (saved) writeRemoved(readRemoved().filter((x) => x !== eventId))
  else writeRemoved([...readRemoved(), eventId])
  if (!accountLinked) return
  fetch('/api/me/saved', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, saved }),
  }).then((r) => { if (r.ok && !saved) writeRemoved(readRemoved().filter((x) => x !== eventId)) }).catch(() => {})
}

/** Merges local bookmarks into the account (applying removals made on this device) and pulls account bookmarks back. */
export async function syncSavedWithAccount() {
  try {
    const local = read()
    const removed = readRemoved()
    const r = await fetch('/api/me/saved', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: local.map((s) => s.id), removed }),
    })
    if (!r.ok) return
    writeRemoved([])
    const { events } = (await r.json()) as { events: SavedEvent[] }
    const ids = new Set(local.map((s) => s.id))
    const gone = new Set(removed)
    const merged = [...local, ...events.filter((e) => !ids.has(e.id) && !gone.has(e.id))]
    if (merged.length !== local.length) write(merged)
  } catch (err) {
    console.error('Saved sync failed:', err)
  }
}

/** Saved events kept in localStorage (synced to the account when signed in) and across components and tabs. */
export function useSaved() {
  const [saved, setSaved] = useState<SavedEvent[]>([])

  useEffect(() => {
    // Past events are never shown (kept in storage so nothing is lost)
    const sync = () => setSaved(read().filter((s) => !isPastEvent(s)))
    sync()
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const isSaved = useCallback((id: string) => saved.some((s) => s.id === id), [saved])

  const toggle = useCallback((ev: SavedEvent) => {
    const list = read()
    const exists = list.some((s) => s.id === ev.id)
    const snapshot: SavedEvent = {
      id: ev.id, title: ev.title, description: ev.description, date: ev.date, endDate: ev.endDate,
      time: ev.time, endTime: ev.endTime, venueName: ev.venueName, suburb: ev.suburb, category: ev.category,
      subTags: ev.subTags ?? [], isLGBTI: ev.isLGBTI, isFree: ev.isFree, price: ev.price, ticketUrl: ev.ticketUrl,
      ...(ev.href ? { href: ev.href } : {}),
    }
    write(exists ? list.filter((s) => s.id !== ev.id) : [...list, snapshot])
    pushToAccount(ev.id, !exists)
  }, [])

  return { saved, isSaved, toggle }
}
