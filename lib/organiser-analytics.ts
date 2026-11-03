/**
 * Performance figures an organiser or venue manager can be shown.
 * Null means we did not measure it. Spend, revenue and attendance are never filled in.
 */

export function engagementRate(input: {
  views: number
  saves: number
  going: number
  reactions: number
  ticketClicks: number
}): number | null {
  if (input.views <= 0) return null
  const actions = input.saves + input.going + input.reactions + input.ticketClicks
  return Math.round((actions / input.views) * 1000) / 10
}

export function trendLabel(recent: number | null, previous: number | null): 'higher' | 'lower' | 'flat' | null {
  if (recent == null || previous == null) return null
  if (recent + previous <= 0) return null
  if (previous === 0) return recent > 0 ? 'higher' : null
  const ratio = recent / previous
  if (ratio >= 1.25) return 'higher'
  if (ratio <= 0.75) return 'lower'
  return 'flat'
}

export function trendSentence(trend: 'higher' | 'lower' | 'flat' | null): string | null {
  if (trend === 'higher') return 'Recent saves, reactions and ticket clicks are higher than the previous 7 days.'
  if (trend === 'lower') return 'Recent saves, reactions and ticket clicks are lower than the previous 7 days.'
  if (trend === 'flat') return 'Recent saves, reactions and ticket clicks are about the same as the previous 7 days.'
  return null
}

export type CampaignSnapshot = {
  status: string
  startsAt: string
  endsAt: string
  impressions: number
  clicks: number
}

export type PerformanceView = {
  saves: number
  going: number
  reactions: number
  views: number | null
  uniqueViews: number | null
  ticketClicks: number | null
  engagementRate: number | null
  trend: string | null
  campaigns: CampaignSnapshot[] | null
  campaignNote: string
  benchmark: null
  benchmarkNote: string
}

export function performanceView(input: {
  views: number
  uniqueViews: number
  ticketClicks: number
  saves: number
  going: number
  reactions: number
  recentActions: number | null
  previousActions: number | null
  campaigns: CampaignSnapshot[] | null
  unlocked: boolean
}): PerformanceView {
  const trend = input.unlocked ? trendSentence(trendLabel(input.recentActions, input.previousActions)) : null
  return {
    saves: input.saves,
    going: input.going,
    reactions: input.reactions,
    views: input.unlocked ? input.views : null,
    uniqueViews: input.unlocked ? input.uniqueViews : null,
    ticketClicks: input.unlocked ? input.ticketClicks : null,
    engagementRate: input.unlocked ? engagementRate(input) : null,
    trend,
    campaigns: input.campaigns,
    campaignNote: input.campaigns == null
      ? 'Placement results stay with the organiser who bought them.'
      : input.campaigns.length
        ? 'Placement totals are measured serves and clicks for this listing. They are not ticket sales.'
        : 'No paid placement is recorded for this listing.',
    benchmark: null,
    benchmarkNote: 'VibePeep does not invent a comparison figure.',
  }
}

/** Click-through only when both sides were measured. */
export function clickThrough(impressions: number, clicks: number): number | null {
  if (impressions <= 0) return null
  return Math.round((clicks / impressions) * 1000) / 10
}
