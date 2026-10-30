import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { isPostcode, parseBirthYear, under16GeoBlock } from '@/lib/profile-shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? body.fullName ?? '').trim() || null
    const role = body.role === 'PROMOTER' ? 'PROMOTER' : 'CONSUMER'
    const orgName = role === 'PROMOTER' ? String(body.orgName ?? '').trim() || name : null
    const homeCity = typeof body.homeCity === 'string' && body.homeCity ? body.homeCity : 'Sydney'

    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    // Event-goers give a birth year (anyone without one is asked for it after signing in).
    let birthYear: number | undefined
    if (body.birthYear != null && body.birthYear !== '') {
      const p = parseBirthYear(body.birthYear)
      if (p.error || p.year == null) return NextResponse.json({ error: p.error ?? 'Enter the year you were born' }, { status: 400 })
      const geo = under16GeoBlock(req.headers.get('x-vercel-ip-country'), p.year)
      if (geo) return NextResponse.json({ error: geo }, { status: 403 })
      birthYear = p.year
    }
    const pc = typeof body.homePostcode === 'string' ? body.homePostcode.trim() : ''
    if (pc && !isPostcode(pc)) return NextResponse.json({ error: 'Postcodes are 4 digits' }, { status: 400 })

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })

    const user = await prisma.user.create({
      data: { email, name, role, orgName, homeCity, birthYear, homePostcode: pc || null, password: await bcrypt.hash(password, 10) },
      select: { id: true, email: true, role: true },
    })
    return NextResponse.json({ ok: true, user })
  } catch (e) {
    console.error('signup error', e)
    return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
  }
}
