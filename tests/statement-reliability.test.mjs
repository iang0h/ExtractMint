import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createColumnStatement, reliabilityMagnitudes } from './fixtures/statement-reliability.mjs'

if (!globalThis.DOMMatrix) {
  const canvas = await import('@napi-rs/canvas')
  globalThis.DOMMatrix = canvas.DOMMatrix
  globalThis.Path2D ??= canvas.Path2D
  globalThis.ImageData ??= canvas.ImageData
}

const projectRoot = resolve(new URL('..', import.meta.url).pathname)
const server = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  ssr: { noExternal: ['exceljs'] },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'statement-reliability-pdf-imports',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) return '\0statement-reliability-pdf-worker'
        if (id === 'exceljs') return '\0statement-reliability-exceljs'
        return undefined
      },
      load(id) {
        if (id === '\0statement-reliability-pdf-worker') {
          const workerPath = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
          return `export default ${JSON.stringify(workerPath)}`
        }
        if (id === '\0statement-reliability-exceljs') {
          const excelPath = resolve(projectRoot, 'node_modules/exceljs/excel.js')
          return `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const ExcelJS = require(${JSON.stringify(excelPath)}); export const Workbook = ExcelJS.Workbook; export default ExcelJS;`
        }
        return undefined
      },
    },
  ],
})

try {
  const converter = await server.ssrLoadModule('/src/lib/converter.ts')
  const review = await server.ssrLoadModule('/src/lib/reviewStatus.ts')
  for (const fixture of [
    { id: 'synthetic-header-columns', offset: 0 },
    { id: 'synthetic-shifted-columns', offset: 70 },
    { id: 'synthetic-multipage-columns', offset: 0, multiPage: true },
  ]) {
    const file = new File([createColumnStatement(fixture)], `${fixture.id}.pdf`, {
      type: 'application/pdf',
      lastModified: 1,
    })
    const [result] = await converter.convertFiles([file], () => {}, { persistOcrCache: false })
    const transactions = result.rows.filter((row) => row.amount !== undefined)

    assert.equal(transactions.length, reliabilityMagnitudes.length * 2, `${fixture.id}: transaction count`)
    assert.deepEqual(
      transactions.filter((row) => row.withdrawal !== undefined).map((row) => row.withdrawal),
      reliabilityMagnitudes,
      `${fixture.id}: all five synthetic magnitudes are assigned to withdrawals`,
    )
    assert.deepEqual(
      transactions.filter((row) => row.deposit !== undefined).map((row) => row.deposit),
      reliabilityMagnitudes,
      `${fixture.id}: all five synthetic magnitudes are assigned to deposits`,
    )
    assert.deepEqual(
      transactions.map((row) => [row.withdrawal !== undefined, row.deposit !== undefined]),
      Array.from({ length: 10 }, (_, index) => index % 2 === 0 ? [true, false] : [false, true]),
      `${fixture.id}: debit and credit directions follow their columns`,
    )
    assert.equal(result.validation.openingBalance, 250000, `${fixture.id}: stated opening balance`)
    assert.equal(result.validation.closingBalance, result.rows.at(-1)?.balance, `${fixture.id}: closing balance`)
    assert.equal(result.validation.status, 'valid', `${fixture.id}: running balances reconcile`)
    assert.equal(
      transactions.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0),
      0,
      `${fixture.id}: all five deposits and withdrawals cancel without inferred repair`,
    )
    if (fixture.multiPage) {
      assert.deepEqual(result.pdfColumnMethods, [{ page: 1, method: 'header' }, { page: 2, method: 'header' }])
    }
  }

  const headerlessFile = new File([createColumnStatement({ includeHeaders: false })], 'synthetic-headerless.pdf', {
    type: 'application/pdf',
    lastModified: 1,
  })
  const [headerless] = await converter.convertFiles([headerlessFile], () => {}, { persistOcrCache: false })
  assert.ok(headerless.rows.length > 0, 'headerless synthetic statement still returns rows')
  assert.ok(headerless.confidence < 80, 'headerless column fallback lowers confidence')
  assert.equal(headerless.validation.status, 'review', 'headerless column fallback requires review')

  const reviewRows = [
    { description: 'OPENING BALANCE', balance: 1000, category: 'Balance', confidence: 96, source: 'Synthetic' },
    { date: '2026-04-01', description: 'Synthetic confirmed debit', withdrawal: 100, amount: -100, balance: 900, category: 'Withdrawal', confidence: 98, source: 'Synthetic' },
    { date: '2026-04-02', description: 'Synthetic wrong debit direction', withdrawal: 40, amount: -40, balance: 940, category: 'Withdrawal', confidence: 98, source: 'Synthetic' },
    { date: '2026-04-03', description: 'Synthetic confirmed credit', deposit: 75, amount: 75, balance: 1015, category: 'Deposit', confidence: 98, source: 'Synthetic' },
    { date: '2026-04-04', description: 'Synthetic wrong credit direction', deposit: 15, amount: 15, balance: 1000, category: 'Deposit', confidence: 98, source: 'Synthetic' },
  ]
  const reviewValidation = converter.revalidateRows(reviewRows, 'USD')
  reviewValidation.issues.push({ severity: 'warning', message: 'Synthetic statement-level notice with no row index.' })
  reviewValidation.issueCount = reviewValidation.issues.length
  assert.deepEqual(
    reviewValidation.issues.filter(({ rowIndex }) => rowIndex !== undefined).map(({ rowIndex }) => rowIndex),
    [2, 4],
    'exactly the two planted direction errors identify rows',
  )
  assert.deepEqual(
    reviewRows.map((_, index) => review.getRowReview(reviewValidation, index).status),
    ['Unvalidated', 'Verified', 'Review', 'Verified', 'Review'],
    'only the two rows with failed checks are flagged; file-level issues stay in the summary',
  )
  const confidenceRows = review.lowerRowConfidence(reviewRows, reviewValidation)
  assert.deepEqual(
    confidenceRows.map((row) => row.confidence),
    [96, 98, 54, 98, 54],
    'failed rows lower their confidence while clean validated rows keep theirs',
  )

  const reviewResult = {
    fileName: 'synthetic-row-review.pdf',
    fileType: 'application/pdf',
    currencyCode: 'USD',
    fileMeta: { size: 100, lastModified: 1 },
    rawText: 'Synthetic Testbank statement',
    rows: confidenceRows,
    confidence: 72,
    validation: reviewValidation,
    processedAt: '2026-04-30T00:00:00.000Z',
    summary: { title: 'Synthetic Testbank', documentKind: 'Statement', total: 230, notes: [] },
  }
  await assertReviewExports(converter, reviewResult)

  console.log('Statement reliability geometry regressions passed.')
} finally {
  await server.close()
}

async function assertReviewExports(converter, result) {
  const expectedStatuses = result.rows.map((_, index) =>
    reviewStatusForTest(result.validation, index),
  )
  const csv = await converter.createCsvBlob(result).text()
  const [headerLine, ...csvLines] = csv.split(/\r?\n/)
  const headers = parseCsvLine(headerLine)
  const csvRows = csvLines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])))
  assert.deepEqual(csvRows.map((row) => row['Review Status']), expectedStatuses, 'CSV review statuses match row-level review')
  assert.equal(csvRows[0]['Review Notes'], '', 'file-level notice is not copied into the opening balance row')

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(await (await converter.createExcelBlob(result)).arrayBuffer()))
  const rowsSheet = workbook.getWorksheet('Rows')
  assert.ok(rowsSheet, 'XLSX export has its Rows worksheet')
  const xlsxHeaders = rowsSheet.getRow(1).values.slice(1).map(String)
  const xlsxRows = []
  rowsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    xlsxRows.push(Object.fromEntries(xlsxHeaders.map((header, index) => [header, row.getCell(index + 1).value ?? ''])))
  })
  assert.deepEqual(xlsxRows.map((row) => row['Review Status']), expectedStatuses, 'XLSX review statuses match row-level review')
  assert.equal(xlsxRows[0]['Review Notes'], '', 'file-level notice is not copied into the opening balance row')

  const qbo = await converter.createQboBlob(result).text()
  const qboTransactions = Array.from(qbo.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g), ([, block]) => ({
    amount: Number(block.match(/<TRNAMT>(-?\d+\.\d{2})/)?.[1]),
    type: block.match(/<TRNTYPE>([A-Z]+)/)?.[1],
  }))
  const expectedTransactions = result.rows.filter((row) => row.date && row.amount !== undefined)
  assert.deepEqual(
    qboTransactions.map(({ amount }) => amount),
    expectedTransactions.map((row) => row.amount),
    'QBO signed transaction amounts match the on-screen rows',
  )
  assert.deepEqual(
    qboTransactions.map(({ type }) => type),
    expectedTransactions.map((row) => row.amount < 0 ? 'DEBIT' : 'CREDIT'),
    'QBO transaction types match the signed row amounts',
  )
}

function reviewStatusForTest(validation, rowIndex) {
  const issues = validation.issues.filter((issue) => issue.rowIndex === rowIndex)
  if (issues.some((issue) => issue.severity === 'error')) return 'Review'
  if (issues.length > 0) return 'Check'
  if (validation.validatedRowIndexes?.includes(rowIndex)) return 'Verified'
  return 'Unvalidated'
}

function parseCsvLine(line) {
  const fields = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"' && quoted) {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      fields.push(value)
      value = ''
    } else {
      value += char
    }
  }
  fields.push(value)
  return fields
}
