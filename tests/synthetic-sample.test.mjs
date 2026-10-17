import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const generator = fileURLToPath(new URL('../scripts/generate-synthetic-sample.mjs', import.meta.url))
const sample = fileURLToPath(new URL('../public/samples/synthetic-bank-statement.pdf', import.meta.url))

const result = spawnSync(process.execPath, [generator], { cwd: projectRoot, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr || result.error?.message)

const pdf = readFileSync(sample)
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
assert.ok(pdf.toString('latin1').trimEnd().endsWith('%%EOF'))
assert.ok(pdf.length > 1024, 'Synthetic sample should exceed 1 KB')
