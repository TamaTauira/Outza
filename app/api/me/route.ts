import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { CATEGORIES } from '@/lib/categories'
import { CITY_NAMES } from '@/lib/cities'
import { isPostcode, parseBirthDate } from '@/lib/profile-shared'
import { cleanVibe } from '@/lib/vibe-shared'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SELECT = {
  id: true, name: true, email: true, role: true, orgName: true, bio: true, website: true, homeCity: true,
  preferredCategories: true, preferredCities: true, emailOptIn: true, emailFrequency: true, lastDigestAt: true,
  birthDate: true, homePostcode: true, vibeProfile: true,
} as const

type Row = { birthDate: Date | null } & Record<string, unknown>
// Date of birth goes back to its owner only, as a plain YYYY-MM-DD string.
const out = (u: Row) => ({ ...u, birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null })

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: SELECT })
  if (!user) return unauthorized()
  return NextResponse.json({ user: out(user) })
}

export async function PATCH(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const b = await req.json().catch(() => ({}))
  const catNames = new Set(CATEGORIES.map((c) => c.name))
  const data: Record<string, unknown> = {}
  if (typeof b.name === 'string') data.name = b.name.trim().slice(0, 80) || null
  if (typeof b.orgName === 'string') data.orgName = b.orgName.trim().slice(0, 120) || null
  if (typeof b.bio === 'string') data.bio = b.bio.trim().slice(0, 1000) || null
  if (typeof b.website === 'string') data.website = b.website.trim().slice(0, 300) || null
  if (typeof b.homeCity === 'string' && CITY_NAMES.includes(b.homeCity)) data.homeCity = b.homeCity
  if (Array.isArray(b.preferredCategories)) data.preferredCategories = b.preferredCategories.filter((c: unknown) => typeof c === 'string' && catNames.has(c))
  if (Array.isArray(b.preferredCities)) data.preferredCities = b.preferredCities.filter((c: unknown) => typeof c === 'string' && CITY_NAMES.includes(c))
  if (typeof b.emailOptIn === 'boolean') data.emailOptIn = b.emailOptIn
  if (['daily', 'weekly', 'monthly'].includes(b.emailFrequency)) data.emailFrequency = b.emailFrequency
  if (b.role === 'PROMOTER' && me.role === 'CONSUMER') data.role = 'PROMOTER'
  if ('birthDate' in b) {
    const p = parseBirthDate(b.birthDate)
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 })
    data.birthDate = p.date
  }
  if ('homePostcode' in b) {
    const pc = typeof b.homePostcode === 'string' ? b.homePostcode.trim() : ''
    if (pc && !isPostcode(pc)) return NextResponse.json({ error: 'Postcodes are 4 digits' }, { status: 400 })
    data.homePostcode = pc || null
  }
  if ('vibeProfile' in b) data.vibeProfile = cleanVibe(b.vibeProfile) ?? Prisma.DbNull
  const user = await prisma.user.update({ where: { id: me.id }, data, select: SELECT })
  return NextResponse.json({ user: out(user) })
}
