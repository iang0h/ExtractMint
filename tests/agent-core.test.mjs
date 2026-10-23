import assert from 'node:assert/strict'
import {
  buildAgentMessages,
  buildFreeLlmPayload,
  classifyGatewayFailure,
  createFallbackAnswer,
  parseChatCompletionText,
  resolveFreeLlmConfig,
  sanitizeAgentQuestion,
} from '../api/agent-core.mjs'
import agentHandler from '../api/agent.js'

const context = {
  fileName: 'testbank-synthetic-statement.pdf',
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
      description: 'Synthetic card payment',
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
assert.match(messages[1].content, /testbank-synthetic-statement\.pdf/)
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
assert.match(fallback, /^AI answers temporarily unavailable — showing built-in guidance\./)
assert.match(fallback, /testbank-synthetic-statement\.pdf/)
assert.match(fallback, /2 validation issues/)
assert.doesNotMatch(fallback, /FREELLMAPI_BASE_URL|API_KEY|not configured/i)

const configuredFallback = createFallbackAnswer('What should I check?', context, {
  configured: true,
})
assert.match(configuredFallback, /^AI answers temporarily unavailable — showing built-in guidance\./)
assert.doesNotMatch(configuredFallback, /FREELLMAPI_BASE_URL|API_KEY|not configured|https?:\/\//i)

const syntheticNetworkFailure = new Error('fetch failed at https://user:synthetic-key@gateway.example.invalid/v1?key=synthetic-key')
assert.equal(classifyGatewayFailure(syntheticNetworkFailure), 'network')
const syntheticHttpFailure = Object.assign(new Error('provider response included a synthetic secret'), { name: 'UpstreamHttpError' })
assert.equal(classifyGatewayFailure(syntheticHttpFailure), 'upstream-http')
const syntheticTimeout = Object.assign(new Error('operation aborted'), { name: 'AbortError' })
assert.equal(classifyGatewayFailure(syntheticTimeout), 'timeout')
assert.equal(classifyGatewayFailure(new Error('synthetic unknown provider failure')), 'unknown')

const originalFetch = globalThis.fetch
const previousBaseUrl = process.env.FREELLMAPI_BASE_URL
const previousApiKey = process.env.FREELLMAPI_API_KEY
const syntheticBaseUrl = 'https://gateway.example.invalid/private?token=synthetic-test-token'
process.env.FREELLMAPI_BASE_URL = syntheticBaseUrl
process.env.FREELLMAPI_API_KEY = 'synthetic-test-key'
globalThis.fetch = async () => {
  throw new Error(`fetch failed at ${syntheticBaseUrl} with synthetic-test-key`)
}
const handlerResponse = {
  statusCode: 0,
  body: undefined,
  headers: {},
  setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this },
  json(body) { this.body = body; return this },
}
await agentHandler({ method: 'POST', body: { question: 'What should I review?', context } }, handlerResponse)
assert.equal(handlerResponse.statusCode, 200)
assert.equal(handlerResponse.body.warning, 'network')
assert.match(handlerResponse.body.answer, /^AI answers temporarily unavailable — showing built-in guidance\./)
assert.doesNotMatch(JSON.stringify(handlerResponse.body), /gateway\.example\.invalid|synthetic-test-token|synthetic-test-key/)
globalThis.fetch = originalFetch
if (previousBaseUrl === undefined) delete process.env.FREELLMAPI_BASE_URL
else process.env.FREELLMAPI_BASE_URL = previousBaseUrl
if (previousApiKey === undefined) delete process.env.FREELLMAPI_API_KEY
else process.env.FREELLMAPI_API_KEY = previousApiKey

console.log('agent-core tests passed')
