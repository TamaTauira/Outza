import { prisma } from '@/lib/db'

const jobs = {
  quality: 'quality-pass',
  images: 'image-pass',
  localImport: 'local-import',
  discover: 'image-discover',
  moshtix: 'moshtix-refresh',
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
          "cursorPage" INTEGER NOT NULL DEFAULT 0,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "JobWatermark_pkey" PRIMARY KEY ("job")
        )
      `
      await prisma.$executeRaw`
        ALTER TABLE "JobWatermark" ADD COLUMN IF NOT EXISTS "cursorPage" INTEGER NOT NULL DEFAULT 0
      `
      await prisma.$executeRaw`
        ALTER TABLE "JobWatermark" ADD COLUMN IF NOT EXISTS "cursorPageSize" INTEGER NOT NULL DEFAULT 0
      `
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

export type JobMark = { at: Date; page: number; pageSize: number }

async function readMark(job: JobName): Promise<JobMark | null> {
  await ensureTable()
  const rows = await prisma.$queryRaw<{ cursorAt: Date; cursorPage: number | null; cursorPageSize: number | null }[]>`
    SELECT "cursorAt", "cursorPage", "cursorPageSize" FROM "JobWatermark" WHERE "job" = ${jobs[job]} LIMIT 1
  `
  const at = rows[0]?.cursorAt
  if (!at) return null
  const page = rows[0]?.cursorPage
  const pageSize = rows[0]?.cursorPageSize
  return {
    at: new Date(at),
    page: page != null && page > 0 ? page : 0,
    pageSize: pageSize != null && pageSize > 0 ? pageSize : 0,
  }
}

/** When the job last finished a pass. Null means it has not completed one yet. */
export async function readJobCursor(job: JobName): Promise<Date | null> {
  return (await readMark(job))?.at ?? null
}

/** Cursor time plus an optional page, for a feed that cannot finish in one invocation. */
export async function readJobMark(job: JobName): Promise<JobMark | null> {
  return readMark(job)
}

/** Remember a cursor. Pass the time the pass started so rows written during it are read next time. */
export async function writeJobCursor(job: JobName, cursorAt: Date, page = 0, pageSize = 0): Promise<void> {
  await ensureTable()
  const storedPage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
  const storedSize = Number.isFinite(pageSize) ? Math.max(0, Math.floor(pageSize)) : 0
  await prisma.$executeRaw`
    INSERT INTO "JobWatermark" ("job", "cursorAt", "cursorPage", "cursorPageSize", "updatedAt")
    VALUES (${jobs[job]}, ${cursorAt}, ${storedPage}, ${storedSize}, NOW())
    ON CONFLICT ("job") DO UPDATE SET "cursorAt" = ${cursorAt}, "cursorPage" = ${storedPage}, "cursorPageSize" = ${storedSize}, "updatedAt" = NOW()
  `
}

/** Prisma filter for rows touched after the cursor. Empty when this is the first pass. */
export function changedSince(cursor: Date | null): { updatedAt: { gt: Date } } | Record<string, never> {
  return cursor ? { updatedAt: { gt: cursor } } : {}
}
