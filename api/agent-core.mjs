const defaultModel = 'auto'
const maxQuestionLength = 1200

export function sanitizeAgentQuestion(question) {
  return String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, maxQuestionLength)
}

export function resolveFreeLlmConfig(env = {}) {
  const baseUrl = String(env.FREELLMAPI_BASE_URL ?? '').replace(/\/+$/, '')
  const apiKey = String(env.FREELLMAPI_API_KEY ?? '')
  const model = String(env.FREELLMAPI_MODEL ?? defaultModel)

  return {
    configured: Boolean(baseUrl && apiKey),
    baseUrl,
    apiKey,
    model,
  }
}

export function buildAgentMessages(question, context = {}) {
  const cleanedQuestion = sanitizeAgentQuestion(question)
  const safeContext = {
    fileName: context.fileName ?? 'No active file',
    documentKind: context.documentKind ?? 'Unknown',
    rowCount: Number(context.rowCount ?? 0),
    confidence: Number(context.confidence ?? 0),
    currencyCode: context.currencyCode ?? 'Unknown',
    validationStatus: context.validationStatus ?? 'missing',
    issueCount: Number(context.issueCount ?? 0),
    statementPeriod: context.statementPeriod ?? 'Unknown',
    sampleRows: Array.isArray(context.sampleRows) ? context.sampleRows.slice(0, 5) : [],
  }

  return [
    {
      role: 'system',
      content:
        'You are ExtractMint, a financial document extraction assistant. Answer questions about converted statements, receipts, invoices, exports, validation issues, and reconciliation. Be concise, practical, and avoid making tax, legal, or investment decisions for the user. If data is incomplete, say what to verify next.',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          question: cleanedQuestion,
          activeDocument: safeContext,
        },
        null,
        2,
      ),
    },
  ]
}

export function buildFreeLlmPayload(question, context, model = defaultModel) {
  return {
    model,
    temperature: 0.2,
    max_tokens: 520,
    messages: buildAgentMessages(question, context),
  }
}

export function parseChatCompletionText(payload) {
  const text = payload?.choices?.[0]?.message?.content
  return typeof text === 'string' ? text.trim() : ''
}

export function createFallbackAnswer(question, context = {}, options = {}) {
  const issueCount = Number(context.issueCount ?? 0)
  const rowCount = Number(context.rowCount ?? 0)
  const confidence = Number(context.confidence ?? 0)
  const status = context.validationStatus ?? 'missing'
  const fileName = context.fileName ?? 'the active document'
  const period = context.statementPeriod ?? 'unknown period'
  const lowerQuestion = sanitizeAgentQuestion(question).toLowerCase()

  const reviewLine =
    issueCount > 0
      ? `I found ${issueCount} validation issues. Start with the flagged rows, then compare the opening and closing balances against the original statement.`
      : `No validation issues are currently flagged. Still spot-check the first row, last row, and any unusually large transaction before using the export.`

  const exportLine = lowerQuestion.includes('export') || lowerQuestion.includes('excel')
    ? 'For Excel, use the XLSX export first because it includes the transaction rows and reconciliation sheet. Use CSV only when another tool needs a simple flat file.'
    : 'For reconciliation, verify date order, descriptions, withdrawals, deposits, balances, and the statement period before filing or importing.'

  return [
    `For ${fileName}, ExtractMint has ${rowCount} rows at ${confidence}% confidence for ${period}.`,
    `Validation status: ${status}. ${reviewLine}`,
    exportLine,
    options.configured
      ? 'FreeLLMAPI is configured, but the gateway is not reachable yet. This is the built-in local guidance until the gateway URL responds.'
      : 'FreeLLMAPI is not configured yet, so this is the built-in local guidance. Add FREELLMAPI_BASE_URL and FREELLMAPI_API_KEY in Vercel to enable live AI answers.',
  ].join('\n\n')
}
