import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const plain = process.env.SEED_ADMIN_PASSWORD
  if (!email || !plain) {
    console.error('Seed aborted: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the environment. Do not commit those values.')
    process.exit(1)
  }
  const password = await bcrypt.hash(plain, 10)
  await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', password },
    create: { email, name: 'Admin', role: 'ADMIN', password, orgName: 'Outza' },
  })
  console.log('Seed complete')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
