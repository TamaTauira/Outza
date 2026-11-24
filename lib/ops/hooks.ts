/**
 * Hooks for the customer-mail run.
 * Auto-replies stay off until that run ships an approved template.
 * Contact form mail is not moved by this code.
 */

export type TemplateHook = { sent: false; reason: 'template-not-approved' }

/** Thank a reporter who left an email. No message is sent until a template is approved. */
export async function thankReporter(_input: { email: string | null; reportId: string; outcome: string }): Promise<TemplateHook> {
  return { sent: false, reason: 'template-not-approved' }
}

export { monthlyOpsSection } from '@/lib/ops/monthly'

/** Ask a claimant for evidence. No message is sent until a template is approved. */
export async function requestClaimEvidence(_input: { email: string | null; claimId: string; kind: 'event' | 'venue' }): Promise<TemplateHook> {
  return { sent: false, reason: 'template-not-approved' }
}
