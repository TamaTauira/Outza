import { prisma } from '@/lib/db'

const jobs = {
  quality: 'quality-pass',
  images: 'image-pass',
  localImport: 'local-import',
  discover: 'image-discover',
} as const

export type JobName = keyof typeof jobs

let ready: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "JobWatermark" (
          "job" TEXT NOT NULL,
          "cursorAt" TIMESTAMP(3) NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "JobWatermark_pkey" PRIMARY KEY ("job")
        )
      `
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

/** When the job last finished a pass. Null means it has not completed one yet. */
export async function readJobCursor(job: JobName): Promise<Date | null> {
  await ensureTable()
  const rows = await prisma.$queryRaw<{ cursorAt: Date }[]>`
    SELECT "cursorAt" FROM "JobWatermark" WHERE "job" = ${jobs[job]} LIMIT 1
  `
  const at = rows[0]?.cursorAt
  return at ? new Date(at) : null
}

/** Remember a cursor. Pass the time the pass started so rows written during it are read next time. */
export async function writeJobCursor(job: JobName, cursorAt: Date): Promise<void> {
  await ensureTable()
  await prisma.$executeRaw`
    INSERT INTO "JobWatermark" ("job", "cursorAt", "updatedAt")
    VALUES (${jobs[job]}, ${cursorAt}, NOW())
    ON CONFLICT ("job") DO UPDATE SET "cursorAt" = ${cursorAt}, "updatedAt" = NOW()
  `
}

/** Prisma filter for rows touched after the cursor. Empty when this is the first pass. */
export function changedSince(cursor: Date | null): { updatedAt: { gt: Date } } | Record<string, never> {
  return cursor ? { updatedAt: { gt: cursor } } : {}
}
