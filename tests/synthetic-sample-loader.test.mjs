import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSampleRunGuard, fetchSyntheticSample, SYNTHETIC_SAMPLE_URL } from '../src/lib/syntheticSample.mjs'

test('fetchSyntheticSample returns the PDF blob from the fixed sample URL', async () => {
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
  const received = await fetchSyntheticSample(async (url) => {
    assert.equal(url, '/samples/synthetic-bank-statement.pdf')
    return { ok: true, blob: async () => pdf }
  })

  assert.equal(SYNTHETIC_SAMPLE_URL, '/samples/synthetic-bank-statement.pdf')
  assert.equal(received, pdf)
  assert.equal(received.type, 'application/pdf')
})

test('fetchSyntheticSample rejects a missing PDF', async () => {
  await assert.rejects(
    fetchSyntheticSample(async () => ({ ok: false, status: 404 })),
    /404/,
  )
})

test('a real upload supersedes a pending sample once, without a false completion or failure', () => {
  const events = []
  const guard = createSampleRunGuard((event) => events.push(event))
  const sample = guard.startSample()

  guard.startUpload()
  guard.startUpload()

  assert.equal(guard.isCurrent(sample), false)
  assert.equal(guard.finish(sample, 'sample_conversion_completed'), false)
  assert.equal(guard.finish(sample, 'sample_conversion_failed'), false)
  assert.deepEqual(events, ['sample_conversion_started', 'sample_conversion_cancelled'])
})

test('an active sample finishes exactly once', () => {
  const events = []
  const guard = createSampleRunGuard((event) => events.push(event))
  const sample = guard.startSample()

  assert.equal(guard.isCurrent(sample), true)
  assert.equal(guard.finish(sample, 'sample_conversion_completed'), true)
  assert.equal(guard.finish(sample, 'sample_conversion_failed'), false)
  assert.deepEqual(events, ['sample_conversion_started', 'sample_conversion_completed'])
})
