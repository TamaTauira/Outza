import { handleRefreshRequest } from '@/lib/cron-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** One listings source, or the finalize step. Vercel Cron calls GET. */
async function run(req: Request, chunk: string) {
  return handleRefreshRequest(req, chunk)
}

export async function GET(req: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params
  return run(req, chunk)
}

export async function POST(req: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params
  return run(req, chunk)
}
