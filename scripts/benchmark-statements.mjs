#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { corpusMetadata, statementCases } from '../benchmarks/statements/fixtures.mjs'
import { createStatementPdf } from '../benchmarks/statements/pdf-generator.mjs'

// The app's PDF.js browser path uses DOM APIs. PDF.js ships this optional canvas
// runtime for Node so the same converter can read generated PDFs in the CLI.
if (!globalThis.DOMMatrix) {
  try {
    const canvasRuntime = await import('@napi-rs/canvas')
    globalThis.DOMMatrix = canvasRuntime.DOMMatrix
    globalThis.Path2D ??= canvasRuntime.Path2D
    globalThis.ImageData ??= canvasRuntime.ImageData
  } catch {
    throw new Error(
      'PDF.js needs a Node DOMMatrix implementation. Install the optional @napi-rs/canvas dependency for this platform.',
    )
  }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const moneyFields = ['amount', 'withdrawal', 'deposit', 'balance']
const scoredFields = ['date', 'description', 'reference', ...moneyFields, 'tax']
const disclaimer =
  'Synthetic digital-PDF fixtures only. These scores do not represent real-bank coverage, scanned-PDF/OCR performance, or production accuracy.'

function usage() {
  return 'Usage: node scripts/benchmark-statements.mjs [--json <path>]'
}

function parseArguments(args) {
  let jsonPath

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--json') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(`--json requires a file path\n${usage()}`)
      }
      if (jsonPath) throw new Error(`Only one --json path is supported\n${usage()}`)
      jsonPath = args[index + 1]
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${args[index]}\n${usage()}`)
  }

  return { jsonPath: jsonPath ? resolve(jsonPath) : undefined }
}

function normalizeDate(value) {
  const text = String(value ?? '').trim()
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const month = Number(iso[2])
    const day = Number(iso[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${iso[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    const [month, day] = first > 12 ? [second, first] : [first, second]
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const monthName = text.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})$/i,
  )
  if (monthName) {
    const monthKey = monthName[1].slice(0, 3).toLowerCase()
    const day = Number(monthName[2])
    const year = monthName[3].length === 2 ? `20${monthName[3]}` : monthName[3]
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      monthKey,
    ) + 1
    if (month >= 1 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return text.toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
}

function normalizeDescription(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function normalizedReference(value) {
  const reference = String(value ?? '').trim()
  return reference ? reference.toLocaleLowerCase('en-US') : undefined
}

function isBalanceMarker(row) {
  return (
    row.category === 'Balance' ||
    /^(?:opening|closing) balance\b/i.test(String(row.description ?? '').trim())
  )
}

function findExactReference(expected, actual, unusedActual) {
  const reference = normalizedReference(expected.reference)
  if (!reference) return -1

  return actual.findIndex(
    (row, index) => unusedActual.has(index) && normalizedReference(row.reference) === reference,
  )
}

function canUseDateDescriptionFallback(expected, actual) {
  // When both rows have references, a differing reference must remain a row mismatch.
  if (normalizedReference(expected.reference) && normalizedReference(actual.reference)) return false
  const expectedDate = normalizeDate(expected.date)
  const actualDate = normalizeDate(actual.date)
  const expectedDescription = normalizeDescription(expected.description)
  const actualDescription = normalizeDescription(actual.description)
  return Boolean(
    expectedDate &&
      actualDate &&
      expectedDescription &&
      actualDescription &&
      expectedDate === actualDate &&
      expectedDescription === actualDescription,
  )
}

function matchRows(expectedRows, actualRows) {
  const unusedActual = new Set(actualRows.map((_, index) => index))
  const matches = []
  const unmatchedExpected = []

  // Resolve all reference matches first so fallback cannot consume a later exact hit.
  expectedRows.forEach((expected, expectedIndex) => {
    const actualIndex = findExactReference(expected, actualRows, unusedActual)
    if (actualIndex < 0) {
      unmatchedExpected.push(expectedIndex)
      return
    }
    unusedActual.delete(actualIndex)
    matches.push({ expectedIndex, actualIndex, matchedBy: 'reference' })
  })

  const stillUnmatched = []
  for (const expectedIndex of unmatchedExpected) {
    const expected = expectedRows[expectedIndex]
    const actualIndex = actualRows.findIndex(
      (row, index) => unusedActual.has(index) && canUseDateDescriptionFallback(expected, row),
    )
    if (actualIndex < 0) {
      stillUnmatched.push(expectedIndex)
      continue
    }
    unusedActual.delete(actualIndex)
    matches.push({ expectedIndex, actualIndex, matchedBy: 'date-description' })
  }

  matches.sort((left, right) => left.expectedIndex - right.expectedIndex)
  return {
    matches,
    unmatchedExpected: stillUnmatched,
    unmatchedActual: [...unusedActual],
  }
}

function fieldValuesEqual(field, expected, actual) {
  const expectedValue = expected[field]
  const actualValue = actual[field]

  if (expectedValue === undefined || expectedValue === null) {
    return actualValue === undefined || actualValue === null
  }
  if (actualValue === undefined || actualValue === null) return false

  if (field === 'date') return normalizeDate(expectedValue) === normalizeDate(actualValue)
  if (field === 'reference') {
    return normalizedReference(expectedValue) === normalizedReference(actualValue)
  }
  if (field === 'description') {
    return String(expectedValue).trim().replace(/\s+/g, ' ') ===
      String(actualValue).trim().replace(/\s+/g, ' ')
  }
  if (typeof expectedValue === 'number' && typeof actualValue === 'number') {
    return Math.round(expectedValue * 100) === Math.round(actualValue * 100)
  }
  return expectedValue === actualValue
}

function rate(exact, total) {
  return total > 0 ? exact / total : 0
}

function scoreCase(statementCase, result) {
  const actualRows = result.rows.filter((row) => !isBalanceMarker(row))
  const expectedRows = statementCase.expectedRows
  const { matches, unmatchedExpected, unmatchedActual } = matchRows(expectedRows, actualRows)
  const fieldCounts = Object.fromEntries(
    scoredFields.map((field) => [field, { exact: 0, total: expectedRows.length }]),
  )
  const exactByExpectedIndex = new Map()

  for (const match of matches) {
    const expected = expectedRows[match.expectedIndex]
    const actual = actualRows[match.actualIndex]
    const exactFields = {}
    for (const field of scoredFields) {
      exactFields[field] = fieldValuesEqual(field, expected, actual)
      if (exactFields[field]) fieldCounts[field].exact += 1
    }
    exactByExpectedIndex.set(match.expectedIndex, exactFields)
    match.expected = expected
    match.actual = actual
    match.exactFields = exactFields
  }

  const fields = Object.fromEntries(
    scoredFields.map((field) => [
      field,
      { ...fieldCounts[field], rate: rate(fieldCounts[field].exact, fieldCounts[field].total) },
    ]),
  )
  const balance = {
    status: result.validation.status,
    checkedRows: result.validation.checkedRows,
    issueCount: result.validation.issueCount,
    passed: result.validation.status === 'valid',
  }
  const allExpectedFieldsExact = expectedRows.every((_, index) => {
    const exactFields = exactByExpectedIndex.get(index)
    return Boolean(exactFields && scoredFields.every((field) => exactFields[field]))
  })
  const passed =
    matches.length === expectedRows.length &&
    actualRows.length === expectedRows.length &&
    allExpectedFieldsExact &&
    balance.passed

  return {
    id: statementCase.id,
    language: statementCase.language,
    expectedCount: expectedRows.length,
    extractedCount: actualRows.length,
    matchedCount: matches.length,
    precision: rate(matches.length, actualRows.length),
    recall: rate(matches.length, expectedRows.length),
    fields,
    balance,
    passed,
    unmatchedExpected: unmatchedExpected.map((index) => expectedRows[index]),
    unmatchedExtracted: unmatchedActual.map((index) => actualRows[index]),
    mismatches: matches.flatMap((match) => {
      const failedFields = scoredFields.filter((field) => !match.exactFields[field])
      return failedFields.length
        ? [{
            expectedReference: match.expected.reference,
            extractedReference: match.actual.reference,
            matchedBy: match.matchedBy,
            failedFields: failedFields.map((field) => ({
              field,
              expected: match.expected[field] ?? null,
              extracted: match.actual[field] ?? null,
            })),
          }]
        : []
    }),
  }
}

function aggregateResults(results) {
  const expectedCount = results.reduce((sum, result) => sum + result.expectedCount, 0)
  const extractedCount = results.reduce((sum, result) => sum + result.extractedCount, 0)
  const matchedCount = results.reduce((sum, result) => sum + result.matchedCount, 0)
  const fields = Object.fromEntries(
    scoredFields.map((field) => {
      const exact = results.reduce((sum, result) => sum + result.fields[field].exact, 0)
      const total = results.reduce((sum, result) => sum + result.fields[field].total, 0)
      return [field, { exact, total, rate: rate(exact, total) }]
    }),
  )

  return {
    expectedCount,
    extractedCount,
    matchedCount,
    precision: rate(matchedCount, extractedCount),
    recall: rate(matchedCount, expectedCount),
    fields,
    balancesValid: results.every((result) => result.balance.passed),
    passed: results.length > 0 && results.every((result) => result.passed),
  }
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function printReport(report, jsonPath) {
  console.log('ExtractMint statement benchmark — SYNTHETIC DATA ONLY')
  console.log(disclaimer)
  console.log('')

  for (const result of report.results) {
    const fields = scoredFields
      .map((field) => `${field} ${percent(result.fields[field].rate)}`)
      .join(' · ')
    console.log(
      `${result.id}: ${result.matchedCount}/${result.expectedCount} matched; ` +
        `${result.extractedCount} extracted; P ${percent(result.precision)} / R ${percent(result.recall)}`,
    )
    console.log(`  fields: ${fields}`)
    console.log(
      `  balance: ${result.balance.status} (${result.balance.checkedRows} checked, ${result.balance.issueCount} issues)`,
    )
  }

  const fields = scoredFields
    .map((field) => `${field} ${percent(report.aggregate.fields[field].rate)}`)
    .join(' · ')
  console.log('')
  console.log(
    `Overall: ${report.aggregate.matchedCount}/${report.aggregate.expectedCount} matched; ` +
      `${report.aggregate.extractedCount} extracted; P ${percent(report.aggregate.precision)} / ` +
      `R ${percent(report.aggregate.recall)}`,
  )
  console.log(`Fields: ${fields}`)
  console.log(`Result: ${report.passed ? 'PASS' : 'FAIL'}`)
  if (jsonPath) console.log(`JSON report: ${jsonPath}`)
}

async function runBenchmark() {
  if (corpusMetadata.synthetic !== true) {
    throw new Error('Refusing to run: the statement benchmark corpus is not marked synthetic.')
  }
  if (!statementCases.length) throw new Error('The synthetic statement corpus is empty.')

  let viteServer
  try {
    viteServer = await createServer({
      configFile: resolve(projectRoot, 'vite.config.ts'),
      root: projectRoot,
      appType: 'custom',
      logLevel: 'error',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        {
          name: 'extractmint-benchmark-pdf-worker-path',
          enforce: 'pre',
          resolveId(id) {
            if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) {
              return '\0extractmint-benchmark-pdf-worker-url'
            }
            return undefined
          },
          load(id) {
            if (id !== '\0extractmint-benchmark-pdf-worker-url') return undefined
            const workerPath = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
            return `export default ${JSON.stringify(workerPath)}`
          },
        },
      ],
    })

    const { convertFiles } = await viteServer.ssrLoadModule('/src/lib/converter.ts')
    const scoredResults = []

    for (const statementCase of statementCases) {
      const fileName = `${statementCase.id}.pdf`
      const file = new File([createStatementPdf(statementCase)], fileName, {
        type: 'application/pdf',
        lastModified: 1,
      })
      const [conversion] = await convertFiles(
        [file],
        () => {},
        { forceOcr: false, persistOcrCache: false },
      )
      scoredResults.push(scoreCase(statementCase, conversion))
    }

    const aggregate = aggregateResults(scoredResults)
    return {
      schema: 'extractmint.synthetic-statement-benchmark.v1',
      synthetic: true,
      corpus: {
        name: corpusMetadata.name,
        disclaimer: corpusMetadata.disclaimer,
        caseCount: statementCases.length,
        transactionCount: statementCases.reduce((sum, item) => sum + item.expectedRows.length, 0),
        scope: 'Digital text PDFs generated in memory from invented fixture data.',
      },
      limitation: disclaimer,
      generatedAt: new Date().toISOString(),
      results: scoredResults,
      aggregate,
      passed: aggregate.passed,
    }
  } finally {
    if (viteServer) await viteServer.close()
  }
}

async function main() {
  const { jsonPath } = parseArguments(process.argv.slice(2))
  const report = await runBenchmark()
  printReport(report, jsonPath)

  if (jsonPath) {
    await mkdir(dirname(jsonPath), { recursive: true })
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  if (!report.passed) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Statement benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
