import assert from 'node:assert/strict'
import {
  buildAgentMessages,
  buildFreeLlmPayload,
  createFallbackAnswer,
  parseChatCompletionText,
  resolveFreeLlmConfig,
  sanitizeAgentQuestion,
} from '../api/agent-core.mjs'

const context = {
  fileName: 'maybank-statement.pdf',
  documentKind: 'Bank statement',
  rowCount: 24,
  confidence: 87,
  currencyCode: 'MYR',
  validationStatus: 'review',
  issueCount: 2,
  statementPeriod: '2026-05-01 to 2026-05-31',
  sampleRows: [
    {
      date: '2026-05-03',
      description: 'CARD PAYMENT',
      withdrawal: 18.5,
      balance: 1280.2,
    },
  ],
}

assert.equal(
  sanitizeAgentQuestion('  How accurate is this export?  '),
  'How accurate is this export?',
)

assert.equal(sanitizeAgentQuestion('x'.repeat(2400)).length, 1200)

assert.deepEqual(resolveFreeLlmConfig({}), {
  configured: false,
  baseUrl: '',
  apiKey: '',
  model: 'auto',
})

assert.deepEqual(
  resolveFreeLlmConfig({
    FREELLMAPI_BASE_URL: 'https://llm.example.com/v1/',
    FREELLMAPI_API_KEY: 'freellmapi-test',
    FREELLMAPI_MODEL: 'gemini-2.5-flash',
  }),
  {
    configured: true,
    baseUrl: 'https://llm.example.com/v1',
    apiKey: 'freellmapi-test',
    model: 'gemini-2.5-flash',
  },
)

const messages = buildAgentMessages('What should I check?', context)
assert.equal(messages.length, 2)
assert.equal(messages[0].role, 'system')
assert.match(messages[0].content, /financial document extraction assistant/)
assert.match(messages[1].content, /maybank-statement\.pdf/)
assert.match(messages[1].content, /What should I check\?/)

const payload = buildFreeLlmPayload('What should I check?', context, 'auto')
assert.equal(payload.model, 'auto')
assert.equal(payload.temperature, 0.2)
assert.equal(payload.messages[1].role, 'user')

assert.equal(
  parseChatCompletionText({
    choices: [{ message: { content: 'Review the flagged rows first.' } }],
  }),
  'Review the flagged rows first.',
)

assert.equal(parseChatCompletionText({ choices: [] }), '')

const fallback = createFallbackAnswer('What should I check?', context)
assert.match(fallback, /maybank-statement\.pdf/)
assert.match(fallback, /2 validation issues/)
assert.match(fallback, /FreeLLMAPI is not configured/)

console.log('agent-core tests passed')
