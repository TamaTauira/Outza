'use client'

import { useCallback, useEffect, useState } from 'react'

export type CollectionEvent = {
  id: string
  title: string
  date: string
  time: string | null
  venueName: string
  suburb: string | null
  city?: string | null
  category?: string | null
  imageUrl?: string | null
  isFree?: boolean
  price?: string | null
  href?: string | null
}

export type Collection = {
  id: string
  name: string
  events: CollectionEvent[]
  updatedAt: number
}

const KEY = 'vibepeep-collections-v1'
const EVT = 'vibepeep-collections-change'

function read(): Collection[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string') : []
  } catch {
    return []
  }
}

function write(list: Collection[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVT))
}

export function encodeCollectionLink(collection: Pick<Collection, 'name' | 'events'>): string {
  const payload = { name: collection.name.slice(0, 80), events: collection.events.slice(0, 40) }
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCollectionLink(token: string): { name: string; events: CollectionEvent[] } | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(padded)))
    const parsed = JSON.parse(json) as { name?: string; events?: CollectionEvent[] }
    if (!parsed?.name || !Array.isArray(parsed.events)) return null
    const events = parsed.events.filter((event) => event && typeof event.id === 'string' && typeof event.title === 'string')
    return { name: String(parsed.name).slice(0, 80), events }
  } catch {
    return null
  }
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])
  useEffect(() => {
    const sync = () => setCollections(read())
    sync()
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const create = useCallback((name: string, events: CollectionEvent[] = []) => {
    const clean = name.trim().slice(0, 80)
    if (!clean) return null
    const next: Collection = { id: `col-${Date.now().toString(36)}`, name: clean, events, updatedAt: Date.now() }
    write([next, ...read()])
    return next
  }, [])

  const rename = useCallback((id: string, name: string) => {
    const clean = name.trim().slice(0, 80)
    if (!clean) return
    write(read().map((item) => (item.id === id ? { ...item, name: clean, updatedAt: Date.now() } : item)))
  }, [])

  const remove = useCallback((id: string) => {
    write(read().filter((item) => item.id !== id))
  }, [])

  const addEvent = useCallback((id: string, event: CollectionEvent) => {
    write(read().map((item) => {
      if (item.id !== id || item.events.some((row) => row.id === event.id)) return item
      return { ...item, events: [...item.events, event], updatedAt: Date.now() }
    }))
  }, [])

  const moveEvent = useCallback((fromId: string, toId: string, eventId: string) => {
    const list = read()
    const from = list.find((item) => item.id === fromId)
    const event = from?.events.find((row) => row.id === eventId)
    if (!event) return
    write(list.map((item) => {
      if (item.id === fromId) return { ...item, events: item.events.filter((row) => row.id !== eventId), updatedAt: Date.now() }
      if (item.id === toId && !item.events.some((row) => row.id === eventId)) return { ...item, events: [...item.events, event], updatedAt: Date.now() }
      return item
    }))
  }, [])

  const removeEvent = useCallback((id: string, eventId: string) => {
    write(read().map((item) => (item.id === id ? { ...item, events: item.events.filter((row) => row.id !== eventId), updatedAt: Date.now() } : item)))
  }, [])

  return { collections, create, rename, remove, addEvent, moveEvent, removeEvent }
}
