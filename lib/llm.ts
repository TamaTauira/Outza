import { generateText, Output, type ModelMessage } from 'ai'

/**
 * Default model is the live AI Gateway id for the mini model these calls
 * already used. It accepts text, JSON, and PDF. Override with AI_GATEWAY_MODEL.
 */
const DEFAULT_MODEL = 'openai/gpt-5.4-mini'

export function gatewayModel(): string {
  const configured = process.env.AI_GATEWAY_MODEL?.trim()
  return configured || DEFAULT_MODEL
}

/** True when this process can authenticate to AI Gateway (OIDC on Vercel, API key locally). */
export function llmConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

/** One JSON object from AI Gateway. Throws if the gateway is unreachable or the body is not an object. */
export async function completeJson(opts: {
  messages: ModelMessage[]
  temperature?: number
  maxOutputTokens?: number
  timeoutMs: number
  maxRetries?: number
}): Promise<any> {
  const { output } = await generateText({
    model: gatewayModel(),
    messages: opts.messages,
    output: Output.json(),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    timeout: opts.timeoutMs,
    maxRetries: opts.maxRetries ?? 0,
    reasoning: 'none',
  })
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('LLM returned no JSON object')
  }
  return output
}
