import {
  buildFreeLlmPayload,
  classifyGatewayFailure,
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

    if (!upstream.ok) {
      const error = new Error('Upstream HTTP failure')
      error.name = 'UpstreamHttpError'
      throw error
    }

    const payload = await upstream.json().catch(() => null)
    const answer = parseChatCompletionText(payload)
    if (!answer) {
      const error = new Error('Invalid provider response')
      error.name = 'InvalidProviderResponseError'
      throw error
    }

    return response.status(200).json({
      answer,
      provider: upstream.headers.get('x-routed-via') || 'freellmapi',
      configured: true,
    })
  } catch (error) {
    return response.status(200).json({
      answer: createFallbackAnswer(question, context, { configured: true }),
      provider: 'local-fallback',
      configured: true,
      warning: classifyGatewayFailure(error),
    })
  }
}
