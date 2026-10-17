import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchSyntheticSample, SYNTHETIC_SAMPLE_URL } from '../src/lib/syntheticSample.mjs'

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
