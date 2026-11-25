/** Copy after a promoter or admin ends a live campaign. Test mode never implies a refund. No Stripe call. */
export function endCampaignMessage(modes: string[]): string {
  const testOnly = modes.length > 0 && modes.every((mode) => mode === 'test')
  if (testOnly) return 'Campaign ended. Test mode: no card was charged, so nothing is refunded. It leaves the board now.'
  return 'Campaign ended. It leaves the board now. A refund is not sent from here. The refunds page still applies.'
}

export function endCampaignConfirm(name: string, test: boolean): string {
  if (test) return `End ${name} now? It leaves the board immediately. Test mode: no card was charged, so nothing is refunded.`
  return `End ${name} now? It leaves the board immediately. A refund is not sent from here.`
}
