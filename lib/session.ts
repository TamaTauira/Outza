import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function getSessionUser() {
  const session = await auth()
  const u = session?.user
  if (!u?.id) return null
  return { id: u.id, role: u.role ?? 'CONSUMER', email: u.email ?? '', name: u.name ?? '' }
}

export const unauthorized = () => NextResponse.json({ error: 'Please sign in' }, { status: 401 })
export const forbidden = () => NextResponse.json({ error: 'Not allowed' }, { status: 403 })

export const isPromoter = (role?: string) => role === 'PROMOTER' || role === 'ADMIN'
