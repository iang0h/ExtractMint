import {
  buildFreeLlmPayload,
  createFallbackAnswer,
  parseChatCompletionText,
  resolveFreeLlmConfig,
  sanitizeAgentQuestion,
} from './agent-core.mjs'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const question = sanitizeAgentQuestion(request.body?.question)
  const context = request.body?.context ?? {}

  if (!question) {
    return response.status(400).json({ error: 'Question is required' })
  }

  const config = resolveFreeLlmConfig(process.env)

  if (!config.configured) {
    return response.status(200).json({
      answer: createFallbackAnswer(question, context),
      provider: 'local-fallback',
      configured: false,
    })
  }

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildFreeLlmPayload(question, context, config.model)),
    })

    const payload = await upstream.json().catch(() => null)

    if (!upstream.ok) {
      const message = payload?.error?.message || `FreeLLMAPI returned HTTP ${upstream.status}`
      throw new Error(message)
    }

    const answer = parseChatCompletionText(payload)
    if (!answer) throw new Error('FreeLLMAPI returned an empty answer')

    return response.status(200).json({
      answer,
      provider: upstream.headers.get('x-routed-via') || 'freellmapi',
      configured: true,
    })
  } catch (error) {
    return response.status(200).json({
      answer: createFallbackAnswer(question, context),
      provider: 'local-fallback',
      configured: false,
      warning: error instanceof Error ? error.message : 'FreeLLMAPI request failed',
    })
  }
}
