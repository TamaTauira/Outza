import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { normaliseSourceKey, parseHostList, type PartnerSourceScope } from '@/lib/partner-scope'

export function generatePartnerPassword(): string {
  return randomBytes(18).toString('base64url')
}

export function parsePartnerSources(raw: unknown): { sources: PartnerSourceScope[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Choose at least one source' }
  const sources: PartnerSourceScope[] = []
  for (const row of raw.slice(0, 12)) {
    const item = row as { sourceKey?: unknown; hostPatterns?: unknown }
    const sourceKey = normaliseSourceKey(String(item?.sourceKey ?? ''))
    if (!sourceKey) return { error: 'Source keys use lowercase letters, numbers and dashes' }
    const hosts = Array.isArray(item?.hostPatterns)
      ? parseHostList(item.hostPatterns.map((host) => String(host)).join(' '))
      : parseHostList(String(item?.hostPatterns ?? ''))
    if (!sources.some((existing) => existing.sourceKey === sourceKey)) sources.push({ sourceKey, hostPatterns: hosts })
  }
  if (!sources.length) return { error: 'Choose at least one source' }
  return { sources }
}

export async function savePartnerAccount(input: {
  email: string
  name: string
  displayName: string
  password?: string | null
  sources: PartnerSourceScope[]
}): Promise<{ ok: true; created: boolean; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim().slice(0, 80) || null
  const displayName = input.displayName.trim().slice(0, 80) || name || email
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, status: 400, error: 'Enter a valid email' }
  if (!input.sources.length) return { ok: false, status: 400, error: 'Choose at least one source' }
  const password = input.password?.trim() ?? ''
  if (password && password.length < 10) return { ok: false, status: 400, error: 'Passwords need at least 10 characters' }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (existing && (existing.role === 'ADMIN' || existing.role === 'PROMOTER')) {
    return { ok: false, status: 409, error: 'That email already belongs to an admin or a promoter. Use a separate partner login.' }
  }
  if (!existing && password.length < 10) return { ok: false, status: 400, error: 'Set a password of at least 10 characters' }

  const hashed = password ? await bcrypt.hash(password, 10) : null
  const userId = existing?.id ?? (await prisma.user.create({
    data: {
      email,
      name,
      orgName: displayName,
      role: 'PARTNER',
      password: hashed,
      emailVerified: new Date(),
      emailOptIn: false,
      reminderOptIn: false,
      emailActivityPersonalisation: false,
    },
    select: { id: true },
  })).id

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'PARTNER',
        name: name ?? undefined,
        orgName: displayName,
        ...(hashed ? { password: hashed, sessionVersion: { increment: 1 } } : {}),
      },
    })
  }

  const account = await prisma.partnerAccount.upsert({
    where: { userId },
    create: { userId, displayName },
    update: { displayName },
    select: { id: true },
  })
  await prisma.partnerSource.deleteMany({ where: { partnerId: account.id } })
  await prisma.partnerSource.createMany({
    data: input.sources.map((source) => ({
      partnerId: account.id,
      sourceKey: source.sourceKey,
      hostPatterns: source.hostPatterns,
    })),
  })
  return { ok: true, created: !existing, userId, email }
}
