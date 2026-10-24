import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { completeness132ExpectedRows, providedStatementLedgers } from './fixtures/provided-statement-ledgers.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixtureRoot = resolve(projectRoot, 'tests/fixtures/reliability-review')
const server = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'extractmint-regression-pdf-worker-path',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) return '\0extractmint-regression-pdf-worker-url'
        return undefined
      },
      load(id) {
        if (id !== '\0extractmint-regression-pdf-worker-url') return undefined
        return `export default ${JSON.stringify(resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'))}`
      },
    },
  ],
})

try {
  const canvasRuntime = await import('@napi-rs/canvas')
  globalThis.DOMMatrix = canvasRuntime.DOMMatrix
  globalThis.Path2D ??= canvasRuntime.Path2D
  globalThis.ImageData ??= canvasRuntime.ImageData
  const converter = await server.ssrLoadModule('/src/lib/converter.ts')
  const { getRowReview } = await server.ssrLoadModule('/src/lib/reviewStatus.ts')
  const sourceCases = [
    ['test_statement_us', 'test_statement_us.pdf'],
    ['test_multiline', 'test_multiline.pdf'],
    ['test_completeness_132', 'test_completeness_132.pdf'],
  ]

  for (const [fixtureId, fileName] of sourceCases) {
    const buffer = await readFile(resolve(fixtureRoot, fileName))
    const file = new File([buffer], fileName, { type: 'application/pdf', lastModified: 1 })
    const [result] = await converter.convertFiles([file], () => {}, { forceOcr: false, persistOcrCache: false })
    const rows = result.rows.filter((row) => row.date)
    const expected = fixtureId === 'test_completeness_132'
      ? completeness132ExpectedRows()
      : providedStatementLedgers[fixtureId].rows
    assert.equal(rows.length, expected.length, `${fixtureId}: exact transaction count`)
    assert.deepEqual(rows.map((row) => ({
      date: row.date,
      description: row.description,
      withdrawal: row.withdrawal,
      deposit: row.deposit,
      amount: row.amount,
      balance: row.balance,
    })), expected.map((row) => ({
      date: row.date,
      description: row.description,
      withdrawal: row.withdrawal,
      deposit: row.deposit,
      amount: row.amount ?? (row.deposit ?? 0) - (row.withdrawal ?? 0),
      balance: row.balance,
    })), `${fixtureId}: source descriptions, order, direction, and balances`)

    const expectedLineNumbers = expected.map((row) => row.sourceLines ?? sourceLinesForExpected(result.rawText, row))
    assert.deepEqual(rows.map((row) => row.sourceLineNumbers), expectedLineNumbers, `${fixtureId}: every description line retains its exact extracted-text provenance`)
    assert.deepEqual(result.provenance.unattachedLineNumbers, [], `${fixtureId}: no transaction or continuation source lines are left unattached`)
    assert.deepEqual(result.rows.filter((row) => row.category === 'Balance').map((row) => row.balance),
      fixtureId === 'test_completeness_132' ? [10000, 16600] : [providedStatementLedgers[fixtureId].openingBalance, providedStatementLedgers[fixtureId].closingBalance],
      `${fixtureId}: explicit opening and closing balances stay separate from transactions`)

    for (const [index, row] of rows.entries()) {
      assert.ok(row.description.trim(), `${fixtureId} row ${index + 1}: description is present`)
      assert.notEqual(getRowReview(result.validation, result.rows.indexOf(row)).status, 'Verified',
        `${fixtureId} row ${index + 1}: balance validation alone cannot verify source description`)
    }

    assert.equal(result.validation.status, 'valid', `${fixtureId}: source rows and running balances reconcile`)
    const expectedOpening = fixtureId === 'test_completeness_132' ? 10000 : providedStatementLedgers[fixtureId].openingBalance
    const expectedClosing = fixtureId === 'test_completeness_132' ? 16600 : providedStatementLedgers[fixtureId].closingBalance
    assert.equal(result.validation.openingBalance, expectedOpening, `${fixtureId}: opening balance`)
    assert.equal(result.validation.closingBalance, expectedClosing, `${fixtureId}: closing balance`)
    const expectedMovement = expected.reduce((sum, row) => sum + (row.amount ?? (row.deposit ?? 0) - (row.withdrawal ?? 0)), 0)
    assert.equal(Math.round((expectedClosing - expectedOpening - expectedMovement) * 100) / 100, 0,
      `${fixtureId}: opening + deposits - withdrawals equals closing`)
    rows.forEach((row) => {
      assert.equal(getRowReview(result.validation, result.rows.indexOf(row)).status, 'Verified',
        `${fixtureId}: source-complete row is verified only after its balance step passes`)
    })
    await assertExportRowsAgree(converter, result, rows, fixtureId)
  }

  const missingDescriptionText = [
    'Synthetic local test bank USD',
    'Statement period: 2026-04-01 to 2026-04-02',
    'Date\tDescription\tReference\tWithdrawal\tDeposit\tTax\tBalance',
    '\tOPENING BALANCE\t\t\t\t\t100.00',
    '2026-04-01\t\t\t10.00\t\t\t90.00',
    '2026-04-02\tSynthetic deposit\t\t\t10.00\t\t100.00',
    '\tCLOSING BALANCE\t\t\t\t\t100.00',
  ].join('\n')
  const missingDescription = converter.parseExtractedText(missingDescriptionText, 'synthetic-empty-description.txt', 'text/plain', { size: missingDescriptionText.length, lastModified: 1 })
  const missingDescriptionRow = missingDescription.rows.findIndex((row) => row.date === '2026-04-01')
  assert.notEqual(missingDescriptionRow, -1, 'synthetic missing-description row is retained for review')
  assert.equal(getRowReview(missingDescription.validation, missingDescriptionRow).status, 'Check',
    'a reconciled row without source description is not marked Verified')
  assert.ok(missingDescription.rows[missingDescriptionRow].confidence <= 68,
    'missing source description lowers row confidence')
  assert.ok(missingDescription.confidence < 98, 'missing source description lowers document confidence')
  assert.throws(() => converter.createQboBlob(missingDescription), /description.*resolved|description.*review/i,
    'QBO is paused when a transaction description is unresolved')

  const builtInSample = converter.createSampleResult()
  const sampleTransactions = builtInSample.rows.filter((row) => row.date)
  const sampleMovement = sampleTransactions.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  assert.equal(builtInSample.validation.openingBalance, 1000, 'built-in sample keeps the stated opening balance')
  assert.equal(builtInSample.validation.closingBalance, 1112.5, 'built-in sample keeps the stated closing balance')
  assert.equal(Math.round((builtInSample.validation.closingBalance - builtInSample.validation.openingBalance - sampleMovement) * 100) / 100, 0,
    'built-in sample reconciliation has zero discrepancy')
  assert.equal(builtInSample.validation.status, 'review', 'built-in sample remains in review when its independent warning is unresolved')
  console.log('Provided synthetic statement PDF regression checks passed: 6 US rows, 10 multiline rows, 132 completeness rows, provenance, reconciliation, and CSV/XLSX/QBO agreement.')
} finally {
  await server.close()
}

function sourceLinesForExpected(rawText, row) {
  const id = row.transactionId
  const lines = rawText.split(/\r?\n/)
  return lines.flatMap((line, index) => {
    const isBase = id ? line.includes(`DEMO TRANSACTION ${id}`) : line.startsWith(`${row.date}\t`)
    const continuation = id && row.description.includes(`INVENTED CONTINUATION REF ${id}`) && line.includes(`INVENTED CONTINUATION REF ${id}`)
    return isBase || continuation ? [index + 1] : []
  })
}

async function assertExportRowsAgree(converter, result, rows, fixtureId) {
  const csvRows = parseCsv(await converter.createCsvBlob(result).text())
  const csvHeaders = csvRows.shift()
  const csvTransactions = csvRows.filter((row) => row[csvHeaders.indexOf('Date')])
  assert.equal(csvTransactions.length, rows.length, `${fixtureId}: CSV transaction count`)
  rows.forEach((row, index) => {
    const exported = csvTransactions[index]
    assert.equal(exported[csvHeaders.indexOf('Description')], row.description, `${fixtureId} row ${index + 1}: CSV description`)
    assert.equal(exported[csvHeaders.indexOf('Source Lines')], row.sourceLineNumbers.join(', '), `${fixtureId} row ${index + 1}: CSV source lines`)
    assert.equal(Number(exported[csvHeaders.indexOf('Amount')]), row.amount, `${fixtureId} row ${index + 1}: CSV amount`)
  })

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(await (await converter.createExcelBlob(result)).arrayBuffer()))
  const rowsSheet = workbook.getWorksheet('Rows')
  const xlsxHeaders = rowsSheet.getRow(1).values.slice(1).map(String)
  const xlsxTransactions = rows.slice(0, rows.length).map((_, index) => rowsSheet.getRow(index + 2))
  assert.equal(xlsxTransactions.length, rows.length, `${fixtureId}: XLSX transaction count`)
  rows.forEach((row, index) => {
    const exported = xlsxTransactions[index]
    assert.equal(exported.getCell(xlsxHeaders.indexOf('Description') + 1).value, row.description, `${fixtureId} row ${index + 1}: XLSX description`)
    assert.equal(exported.getCell(xlsxHeaders.indexOf('Source Lines') + 1).value, row.sourceLineNumbers.join(', '), `${fixtureId} row ${index + 1}: XLSX source lines`)
    assert.equal(Number(exported.getCell(xlsxHeaders.indexOf('Amount') + 1).value), row.amount, `${fixtureId} row ${index + 1}: XLSX amount`)
  })

  const qbo = await converter.createQboBlob(result).text()
  const qboRows = [...qbo.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g)].map((match) => Object.fromEntries(
    [...match[1].matchAll(/<(TRNTYPE|DTPOSTED|TRNAMT|FITID|REFNUM|NAME|MEMO)>([^\r\n]*)/g)].map((field) => [field[1], decodeSgml(field[2])]),
  ))
  assert.equal(qboRows.length, rows.length, `${fixtureId}: QBO transaction count`)
  rows.forEach((row, index) => {
    const exported = qboRows[index]
    const canonicalDate = converter.canonicalStatementDate(row.date, result.dateConvention)
    assert.equal(exported.DTPOSTED, canonicalDate?.replaceAll('-', ''), `${fixtureId} row ${index + 1}: QBO date`)
    assert.equal(Number(exported.TRNAMT), row.amount, `${fixtureId} row ${index + 1}: QBO amount`)
    assert.ok(exported.MEMO.includes(row.description), `${fixtureId} row ${index + 1}: QBO memo preserves the full description`)
    assert.ok(exported.MEMO.includes(`Source lines: ${row.sourceLineNumbers.join(', ')}`), `${fixtureId} row ${index + 1}: QBO carries source provenance`)
  })
}

function parseCsv(text) {
  const lines = text.trimEnd().split(/\r?\n/)
  return lines.map((line) => {
    const cells = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"' && line[index + 1] === '"' && quoted) {
        value += '"'
        index += 1
      } else if (character === '"') quoted = !quoted
      else if (character === ',' && !quoted) { cells.push(value); value = '' }
      else value += character
    }
    cells.push(value)
    return cells
  })
}

function decodeSgml(value) {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}
