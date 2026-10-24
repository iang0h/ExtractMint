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
  ssr: { noExternal: ['exceljs'] },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'extractmint-regression-pdf-worker-path',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) return '\0extractmint-regression-pdf-worker-url'
        if (id === 'exceljs') return '\0extractmint-regression-exceljs'
        return undefined
      },
      load(id) {
        if (id === '\0extractmint-regression-pdf-worker-url') {
          return `export default ${JSON.stringify(resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'))}`
        }
        if (id === '\0extractmint-regression-exceljs') {
          const excelPath = resolve(projectRoot, 'node_modules/exceljs/excel.js')
          return `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const ExcelJS = require(${JSON.stringify(excelPath)}); export const Workbook = ExcelJS.Workbook; export default ExcelJS;`
        }
        return undefined
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
  const statementDates = await server.ssrLoadModule('/src/lib/statementDates.ts')
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
      assert.ok(!result.validation.issues.some((issue) => issue.code === 'missing-description' && issue.rowIndex === result.rows.indexOf(row)),
        `${fixtureId} row ${index + 1}: a complete source description has no missing-description warning`)
    }

    assert.equal(result.validation.status, 'valid', `${fixtureId}: source rows and running balances reconcile`)
    const expectedOpening = fixtureId === 'test_completeness_132' ? 10000 : providedStatementLedgers[fixtureId].openingBalance
    const expectedClosing = fixtureId === 'test_completeness_132' ? 16600 : providedStatementLedgers[fixtureId].closingBalance
    assert.equal(result.validation.openingBalance, expectedOpening, `${fixtureId}: opening balance`)
    assert.equal(result.validation.closingBalance, expectedClosing, `${fixtureId}: closing balance`)
    const expectedMovement = expected.reduce((sum, row) => sum + (row.amount ?? (row.deposit ?? 0) - (row.withdrawal ?? 0)), 0)
    assert.equal(Math.abs(Math.round((expectedClosing - expectedOpening - expectedMovement) * 100) / 100), 0,
      `${fixtureId}: opening + deposits - withdrawals equals closing`)
    rows.forEach((row) => {
      assert.equal(getRowReview(result.validation, result.rows.indexOf(row)).status, 'Verified',
        `${fixtureId}: source-complete row is verified only after its balance step passes`)
    })
    await assertExportRowsAgree(converter, result, rows, fixtureId)
  }

  const ddmmLedger = JSON.parse(await readFile(resolve(fixtureRoot, 'ddmm-completeness-132-ledger.json'), 'utf8'))
  assert.equal(ddmmLedger.synthetic, true, 'the separate DD/MM expected ledger is marked synthetic')
  const ddmmFile = new File(
    [await readFile(resolve(fixtureRoot, 'ddmm-completeness-132.pdf'))],
    'ddmm-completeness-132.pdf',
    { type: 'application/pdf', lastModified: 1 },
  )
  const [ddmmResult] = await converter.convertFiles([ddmmFile], () => {}, { persistOcrCache: false })
  const ddmmRows = ddmmResult.rows.filter((row) => row.date)
  assert.equal(ddmmRows.length, 132, 'DD/MM multi-page fixture preserves all 132 transactions')
  assert.deepEqual(ddmmResult.dateConvention, { format: 'DD/MM/YYYY', source: 'document' },
    'unambiguous day values on every page identify the document date convention')
  assert.deepEqual(ddmmRows.map((row) => ({
    date: row.date,
    description: row.description,
    reference: row.reference,
    withdrawal: row.withdrawal,
    deposit: row.deposit,
    amount: row.amount,
    balance: row.balance,
    sourceLines: row.sourceLineNumbers,
  })), ddmmLedger.transactions.map((row) => ({
    date: row.date,
    description: row.description,
    reference: row.reference,
    withdrawal: row.withdrawal,
    deposit: row.deposit,
    amount: row.amount,
    balance: row.balance,
    sourceLines: row.sourceLines,
  })), 'DD/MM fixture preserves exact identities, ordering, values, text, and source lines')
  assert.deepEqual(ddmmResult.rows.filter((row) => row.category === 'Balance').map((row) => row.balance),
    [ddmmLedger.openingBalance, ddmmLedger.closingBalance], 'DD/MM balance markers remain separate from transactions')
  assert.equal(ddmmResult.validation.status, 'valid', 'all DD/MM balances reconcile')
  assert.equal(ddmmResult.validation.openingBalance, ddmmLedger.openingBalance)
  assert.equal(ddmmResult.validation.closingBalance, ddmmLedger.closingBalance)
  assert.equal(ddmmResult.provenance.unattachedLineNumbers.length, 0, 'no DD/MM source lines remain unattached')
  assert.ok(ddmmResult.provenance.ignoredLineNumbers.length >= 21, 'repeated page headings are classified as ignored, not transactions')
  await assertExportRowsAgree(converter, ddmmResult, ddmmRows, 'ddmm-completeness-132')

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
  assert.throws(() => converter.createQboBlob(missingDescription), /resolved description|description.*review/i,
    'QBO is paused when a transaction description is unresolved')

  const conflictingDocumentDatesText = [
    'Synthetic document with conflicting date evidence, USD',
    'Statement period: 13/04/2026 to 15/04/2026',
    'Date\tDescription\tReference\tWithdrawal\tDeposit\tTax\tBalance',
    '\tOPENING BALANCE\t\t\t\t\t100.00',
    '04/13/2026\tSynthetic conflicting-date deposit\tDATE-CONFLICT-01\t\t10.00\t\t110.00',
    '\tCLOSING BALANCE\t\t\t\t\t110.00',
  ].join('\n')
  const conflictingDocumentDates = converter.parseExtractedText(conflictingDocumentDatesText, 'synthetic-conflicting-document-dates.txt', 'text/plain', { size: conflictingDocumentDatesText.length, lastModified: 1 })
  assert.deepEqual(conflictingDocumentDates.dateConvention, { source: 'conflict' },
    'contradictory statement-period and transaction dates require a choice')
  assert.ok(conflictingDocumentDates.confidence < 98, 'date conflict lowers confidence')
  assert.throws(() => converter.createQboBlob(conflictingDocumentDates), /Choose DD\/MM\/YYYY or MM\/DD\/YYYY/,
    'QBO waits while document date clues conflict')
  for (const format of ['DD/MM/YYYY', 'MM/DD/YYYY']) {
    const stillUnresolved = converter.applyDateConvention(conflictingDocumentDates, format)
    assert.ok(statementDates.needsDateConventionChoice(
      stillUnresolved.rows,
      stillUnresolved.statementPeriod,
      stillUnresolved.dateConvention,
      stillUnresolved.closingBalanceDateRaw ?? stillUnresolved.closingBalanceDate,
    ), `${format} leaves conflicting source dates unresolved rather than guessing`)
    assert.throws(() => converter.createQboBlob(stillUnresolved), /Choose DD\/MM\/YYYY or MM\/DD\/YYYY/,
      `${format} cannot export while any document date remains invalid`)
  }

  const makeQboTestResult = ({ description, reference = 'SYNTH-QBO-01', amountCell = '\t\t10.00\t\t110.00' }) => {
    const text = [
      'Synthetic OFX test statement, USD',
      'Statement period: 2026-04-01 to 2026-04-01',
      'Date\tDescription\tReference\tWithdrawal\tDeposit\tTax\tBalance',
      '\tOPENING BALANCE\t\t\t\t\t100.00',
      `2026-04-01\t${description}\t${reference}${amountCell}`,
      '\tCLOSING BALANCE\t\t\t\t\t110.00',
    ].join('\n')
    return converter.parseExtractedText(text, 'synthetic-ofx-test.txt', 'text/plain', { size: text.length, lastModified: 1 })
  }
  const escapedQboResult = makeQboTestResult({ description: 'ALPHA <BETA> & GAMMA', reference: 'REF<&>1' })
  const escapedQboText = await converter.createQboBlob(escapedQboResult).text()
  assert.match(escapedQboText, /<NAME>ALPHA &lt;BETA&gt; &amp; GAMMA/,
    'QBO escapes SGML reserved characters in NAME')
  assert.match(escapedQboText, /<REFNUM>REF&lt;&amp;&gt;1/,
    'QBO escapes SGML reserved characters in REFNUM')
  assert.match(escapedQboText, /<MEMO>ALPHA &lt;BETA&gt; &amp; GAMMA \| Source lines: 5/,
    'QBO memo retains the complete description and source-line provenance')
  const maxReference = 'R'.repeat(32)
  assert.match(await converter.createQboBlob(makeQboTestResult({ description: 'Reference limit', reference: maxReference })).text(),
    new RegExp(`<REFNUM>${maxReference}`), 'QBO REFNUM keeps the full 32-character boundary value')

  const longDescription = `FULL DESCRIPTION ${'detail '.repeat(5)}`.trim()
  const longReference = `LONG-REFERENCE-${'R'.repeat(30)}`
  const longQboText = await converter.createQboBlob(makeQboTestResult({ description: longDescription, reference: longReference })).text()
  const longQboRow = [...longQboText.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g)][0][1]
  assert.match(longQboRow, new RegExp(`<NAME>${longDescription.slice(0, 32)}`),
    'QBO NAME uses its 32-character maximum')
  assert.doesNotMatch(longQboRow, /<REFNUM>/, 'references longer than 32 characters are not silently truncated into REFNUM')
  assert.ok(decodeSgml(longQboRow.match(/<MEMO>([^\r\n]*)/)?.[1] ?? '').includes(longDescription),
    'QBO MEMO preserves the complete long description')
  assert.ok(decodeSgml(longQboRow.match(/<MEMO>([^\r\n]*)/)?.[1] ?? '').includes(`Source reference: ${longReference}`),
    'QBO MEMO carries a full reference that exceeds REFNUM')
  assert.throws(
    () => converter.createQboBlob(makeQboTestResult({ description: 'OVERFLOW '.repeat(30), reference: longReference })),
    /255-character QBO memo limit/i,
    'QBO rejects memo overflow instead of truncating source text',
  )
  assert.throws(
    () => converter.createQboBlob(makeQboTestResult({ description: 'CAFÉ PAYMENT' })),
    /US-ASCII|CSV or Excel/i,
    'QBO refuses text that cannot be represented in its declared ASCII encoding',
  )
  const unresolvedAmount = makeQboTestResult({ description: 'UNRESOLVED AMOUNT', amountCell: '\t\t\t\t110.00' })
  assert.throws(() => converter.createQboBlob(unresolvedAmount), /resolved amount/i,
    'QBO is blocked when the transaction amount is unresolved')

  const sampleBuffer = await readFile(resolve(projectRoot, 'public/samples/synthetic-bank-statement.pdf'))
  const sampleFile = new File([sampleBuffer], 'synthetic-bank-statement.pdf', { type: 'application/pdf', lastModified: 1 })
  const [builtInSample] = await converter.convertFiles([sampleFile], () => {}, { persistOcrCache: false })
  const sampleTransactions = builtInSample.rows.filter((row) => row.date && row.amount !== undefined)
  const sampleMovement = sampleTransactions.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0)
  assert.deepEqual(sampleTransactions.map((row) => ({
    withdrawal: row.withdrawal,
    deposit: row.deposit,
    amount: row.amount,
    balance: row.balance,
  })), [
    { withdrawal: 125.5, deposit: undefined, amount: -125.5, balance: 874.5 },
    { withdrawal: undefined, deposit: 300, amount: 300, balance: 1174.5 },
    { withdrawal: 62, deposit: undefined, amount: -62, balance: 1112.5 },
  ], 'built-in sample keeps each withdrawal, deposit, signed movement, and running balance in its correct column')
  assert.equal(sampleMovement, 112.5, 'built-in sample net change is +112.50')
  assert.equal(builtInSample.validation.openingBalance, 1000, 'built-in sample keeps the stated opening balance')
  assert.equal(builtInSample.validation.closingBalance, 1112.5, 'built-in sample keeps the stated closing balance')
  assert.equal(Math.abs(Math.round((builtInSample.validation.closingBalance - builtInSample.validation.openingBalance - sampleMovement) * 100) / 100), 0,
    'built-in sample reconciliation has zero discrepancy')
  assert.equal(builtInSample.validation.status, 'review', 'built-in sample remains in review when its independent warning is unresolved')
  assert.equal(builtInSample.dateConvention?.format, undefined, 'the ambiguous sample dates do not silently choose a date order')
  assert.ok(statementDates.needsDateConventionChoice(
    builtInSample.rows,
    builtInSample.statementPeriod,
    builtInSample.dateConvention,
    builtInSample.closingBalanceDateRaw ?? builtInSample.closingBalanceDate,
  ), 'the built-in sample asks for a date-format choice')
  assert.ok(builtInSample.confidence < 98, 'the headerless sample never claims 98% confidence')
  assert.ok(sampleTransactions.every((row) => getRowReview(builtInSample.validation, builtInSample.rows.indexOf(row)).status !== 'Verified'),
    'the headerless sample transaction rows stay out of Verified until their warnings are resolved')
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
  const xlsxTransactions = rowsSheet.getRows(2, rowsSheet.rowCount - 1)
    .filter((row) => row.getCell(xlsxHeaders.indexOf('Date') + 1).value)
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
    if (row.reference && row.reference.length <= 32) {
      assert.equal(exported.REFNUM, row.reference, `${fixtureId} row ${index + 1}: QBO preserves the reference field`)
    } else if (row.reference) {
      assert.ok(exported.MEMO.includes(`Source reference: ${row.reference}`), `${fixtureId} row ${index + 1}: QBO memo preserves a long reference`)
    }
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
