import { prisma } from '@/lib/prisma'
import { redirectTargetForBareId } from '@/lib/event-redirect'

/** Lookup for the bare-id 301. Null lets the event page 404 or render. */
export async function lookupBareEventRedirect(id: string): Promise<string | null> {
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true },
  }).catch(() => null)
  return redirectTargetForBareId(id, event)
}
