import { handleRefreshRequest } from '@/lib/cron-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Manual refresh. Runs the first chunk in this invocation (under the 300s Pro limit)
 * and dispatches the rest. Scheduled chunks are `/api/cron/refresh/<id>`.
 */
async function run(req: Request) {
  const chunk = new URL(req.url).searchParams.get('chunk')
  return handleRefreshRequest(req, chunk)
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
