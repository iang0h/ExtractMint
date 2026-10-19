import assert from 'node:assert/strict'
import test from 'node:test'
import { attachPdfPasswordPrompt } from '../src/lib/pdfPasswordPrompt.mjs'

const passwordResponses = { INCORRECT_PASSWORD: 2 }
const flush = () => new Promise((resolve) => setImmediate(resolve))
const fakeTask = () => ({
  onPassword: null,
  destroyed: false,
  async destroy() { this.destroyed = true },
})

test('maps password and incorrect-password requests and applies each answer', async () => {
  const task = fakeTask()
  const reasons = []
  const answers = ['wrong-once', 'synthetic-correct']
  const applied = []
  attachPdfPasswordPrompt(task, async (reason) => {
    reasons.push(reason)
    return answers.shift()
  }, passwordResponses)

  task.onPassword((password) => applied.push(password), 1)
  await flush()
  task.onPassword((password) => applied.push(password), 2)
  await flush()

  assert.deepEqual(reasons, ['required', 'incorrect'])
  assert.deepEqual(applied, ['wrong-once', 'synthetic-correct'])
})

test('destroys the loading task when the prompt is canceled', async () => {
  const task = fakeTask()
  const applied = []
  attachPdfPasswordPrompt(task, async () => { throw new Error('canceled') }, passwordResponses)
  task.onPassword((password) => applied.push(password), 1)
  await flush()
  await flush()
  assert.equal(task.destroyed, true)
  assert.deepEqual(applied, [])
})

test('does not apply a pending password after the handler is detached', async () => {
  const task = fakeTask()
  let resolvePassword
  const applied = []
  const detach = attachPdfPasswordPrompt(task, () => new Promise((resolve) => { resolvePassword = resolve }), passwordResponses)
  task.onPassword((password) => applied.push(password), 1)
  await flush()
  detach()
  resolvePassword('stale-value')
  await flush()
  assert.deepEqual(applied, [])
})
