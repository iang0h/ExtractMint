import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { statementCases } from '../benchmarks/statements/fixtures.mjs'
import { createStatementPdf } from '../benchmarks/statements/pdf-generator.mjs'

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
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'statement-regression-pdf-worker-path',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) return '\0statement-regression-pdf-worker-url'
        if (id === 'exceljs') return '\0statement-regression-exceljs'
        return undefined
      },
      load(id) {
        if (id === '\0statement-regression-pdf-worker-url') {
          const workerPath = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
          return `export default ${JSON.stringify(workerPath)}`
        }
        if (id === '\0statement-regression-exceljs') {
          const excelPath = resolve(projectRoot, 'node_modules/exceljs/excel.js')
          return `import ExcelJS from ${JSON.stringify(excelPath)}; export const Workbook = ExcelJS.Workbook; export default ExcelJS;`
        }
        return undefined
      },
    },
  ],
})

try {
  const converter = await server.ssrLoadModule('/src/lib/converter.ts')
  const sampleBytes = await readFile(resolve(projectRoot, 'public/samples/synthetic-bank-statement.pdf'))
  const cases = [
    {
      id: 'shipped-synthetic-sample',
      file: new File([sampleBytes], 'synthetic-bank-statement.pdf', { type: 'application/pdf', lastModified: 1 }),
      dateFormat: 'DMY',
      openingBalance: 1000,
      closingBalance: 1112.5,
      status: 'valid',
      expectedRows: [
        { date: '2026-04-03', sourceDate: '03/04/2026', description: /Studio supplies/, withdrawal: 125.5, deposit: undefined, amount: -125.5, balance: 874.5 },
        { date: '2026-04-05', sourceDate: '05/04/2026', description: /Project credit/, withdrawal: undefined, deposit: 300, amount: 300, balance: 1174.5 },
        { date: '2026-04-07', sourceDate: '07/04/2026', description: /Service charge/, withdrawal: 62, deposit: undefined, amount: -62, balance: 1112.5 },
      ],
    },
    ...statementCases
      .filter(({ id }) => ['synthetic-signed-amount-ledger', 'synthetic-debit-credit-ledger', 'synthetic-multipage-ledger', 'synthetic-mismatched-balance-ledger'].includes(id))
      .map((statementCase) => ({
        id: statementCase.id,
        file: new File([createStatementPdf(statementCase)], `${statementCase.id}.pdf`, { type: 'application/pdf', lastModified: 1 }),
        dateFormat: statementCase.id === 'synthetic-debit-credit-ledger' || statementCase.id === 'synthetic-multipage-ledger' ? 'MDY' : 'DMY',
        openingBalance: statementCase.openingBalance,
        closingBalance: statementCase.closingBalance,
        status: statementCase.expectedValidation ?? 'valid',
        expectedRows: statementCase.expectedRows.map((row) => ({ ...row, description: new RegExp(row.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })),
      })),
  ]

  const results = []
  for (const statementCase of cases) {
    const [result] = await converter.convertFiles(
      [statementCase.file],
      () => {},
      { forceOcr: false, persistOcrCache: false },
    )
    assert.ok(result, `${statementCase.id}: converter returns a result`)
    results.push({ statementCase, result })

    assert.equal(result.rows.length, statementCase.expectedRows.length, `${statementCase.id}: transaction row count`)
    assert.equal(result.dateFormat?.detected, statementCase.dateFormat, `${statementCase.id}: detected date format`)
    assert.equal(result.dateFormat?.selected, statementCase.dateFormat, `${statementCase.id}: selected date format`)
    assert.equal(result.validation.openingBalance, statementCase.openingBalance, `${statementCase.id}: explicit opening balance`)
    assert.equal(result.validation.closingBalance, statementCase.closingBalance, `${statementCase.id}: closing balance`)
    assert.equal(result.validation.status, statementCase.status, `${statementCase.id}: validation status`)

    statementCase.expectedRows.forEach((expected, index) => {
      const actual = result.rows[index]
      assert.equal(actual.date, expected.date, `${statementCase.id} row ${index + 1}: normalized date`)
      assert.equal(actual.sourceDate, expected.sourceDate, `${statementCase.id} row ${index + 1}: source date`)
      assert.match(actual.description, expected.description, `${statementCase.id} row ${index + 1}: description`)
      for (const field of ['withdrawal', 'deposit', 'amount', 'balance']) {
        assert.equal(actual[field], expected[field], `${statementCase.id} row ${index + 1}: ${field}`)
      }
    })

    const calculatedNet = result.rows.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0)
    if (statementCase.status === 'valid') {
      assert.equal(Math.round(calculatedNet * 100) / 100, Math.round((statementCase.closingBalance - statementCase.openingBalance) * 100) / 100, `${statementCase.id}: opening + deposits - withdrawals = closing`)
    } else {
      assert.notEqual(Math.round(calculatedNet * 100) / 100, Math.round((statementCase.closingBalance - statementCase.openingBalance) * 100) / 100, `${statementCase.id}: synthetic discrepancy remains flagged`)
    }

    if (statementCase.status === 'valid') {
      assert.equal(result.validation.issueCount, 0, `${statementCase.id}: no validation issues`)
      assert.ok(result.confidence >= 80, `${statementCase.id}: fully reconciled confidence`)
    } else {
      assert.ok(result.confidence < 98, `${statementCase.id}: failed reconciliation lowers confidence`)
      assert.match(result.validation.issues.map(({ message }) => message).join(' '), /balance|reconcil|delta/i)
    }

    await assertExportsMatchRows(converter, result, statementCase)
  }

  const sampleResult = results[0].result
  assert.equal(sampleResult.statementPeriod?.start, '2026-04-03', 'sample period starts on 3 April under DMY')
  assert.equal(sampleResult.statementPeriod?.end, '2026-04-07', 'sample period ends on 7 April under DMY')
  const switched = converter.reinterpretResultDateFormat(sampleResult, 'MDY')
  assert.equal(switched.rows[0].date, '2026-03-04', 'date-format control can reinterpret the sample as MDY')
  assert.equal(switched.statementPeriod?.start, '2026-03-04', 'date-format control updates the statement period')
  assert.equal(switched.rows[0].sourceDate, '03/04/2026', 'date-format switch preserves the source date')

  const ambiguousSource = {
    id: 'synthetic-ambiguous-date-ledger',
    headers: ['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'],
    includeHeaders: true,
    introText: statementCases[0].introText.replace(' Date format: DD/MM/YYYY.', ''),
    tableRows: [
      { kind: 'opening-balance', cells: ['', 'OPENING BALANCE', '', '', '', '', '100.00'] },
      { kind: 'transaction', cells: ['03/04/2026', 'Synthetic ambiguous date', 'SYN-AMB-001', '10.00', '', '', '90.00'] },
      { kind: 'closing-balance', cells: ['', 'CLOSING BALANCE', '', '', '', '', '90.00'] },
    ],
  }
  const [ambiguousResult] = await converter.convertFiles(
    [new File([createStatementPdf(ambiguousSource)], 'synthetic-ambiguous-date-ledger.pdf', { type: 'application/pdf', lastModified: 1 })],
    () => {},
    { forceOcr: false, persistOcrCache: false },
  )
  assert.equal(ambiguousResult.dateFormat?.detected, 'ambiguous', 'ambiguous numeric dates are not guessed')
  assert.equal(ambiguousResult.rows[0]?.date, undefined, 'ambiguous dates stay unresolved until selected')
  assert.equal(ambiguousResult.rows[0]?.sourceDate, '03/04/2026', 'ambiguous source date remains visible')
  assert.equal(ambiguousResult.validation.status, 'review', 'ambiguous dates require review')
  assert.ok(ambiguousResult.confidence < 98, 'ambiguous dates lower confidence')
  const ambiguousSelected = converter.reinterpretResultDateFormat(ambiguousResult, 'DMY')
  assert.equal(ambiguousSelected.rows[0]?.date, '2026-04-03', 'selecting DMY resolves the row date')
  assert.equal(ambiguousSelected.validation.status, 'valid', 'selecting DMY can complete reconciliation')
  await assertExportsMatchRows(converter, ambiguousSelected, { id: 'synthetic-ambiguous-date-ledger', status: 'valid' })

  console.log(`Statement extraction regressions passed for ${cases.length + 1} synthetic statements and XLSX, CSV, and QBO exports.`)
} finally {
  await server.close()
}

async function assertExportsMatchRows(converter, result, statementCase) {
  const csv = await converter.createCsvBlob(result).text()
  const csvLines = csv.split(/\r?\n/)
  const csvHeaders = parseCsvLine(csvLines[0])
  const csvRows = csvLines.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [csvHeaders[index], value])))

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const xlsxBlob = await converter.createExcelBlob(result)
  await workbook.xlsx.load(Buffer.from(await xlsxBlob.arrayBuffer()))
  const worksheet = workbook.getWorksheet('Rows')
  assert.ok(worksheet, `${statementCase.id}: Excel Rows sheet exists`)
  const excelHeaders = worksheet.getRow(1).values.slice(1).map(String)
  const excelRows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    excelRows.push(Object.fromEntries(excelHeaders.map((header, index) => [header, row.getCell(index + 1).value ?? ''])))
  })

  const qbo = await converter.createQboBlob(result).text()
  const qboRows = Array.from(qbo.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g), ([, block]) => ({
    date: block.match(/<DTPOSTED>(\d{8})/)?.[1] ?? '',
    amount: Number(block.match(/<TRNAMT>(-?\d+\.\d{2})/)?.[1]),
    description: block.match(/<NAME>([^\n]*)/)?.[1] ?? '',
  }))

  assert.equal(csvRows.length, result.rows.length, `${statementCase.id}: CSV row count matches on-screen rows`)
  assert.equal(excelRows.length, result.rows.length, `${statementCase.id}: Excel row count matches on-screen rows`)
  assert.equal(qboRows.length, result.rows.length, `${statementCase.id}: QBO row count matches on-screen rows`)

  result.rows.forEach((row, index) => {
    assert.equal(csvRows[index].Date, row.date ?? '', `${statementCase.id} CSV row ${index + 1}: date matches on-screen`)
    assert.equal(csvRows[index].Description, row.description, `${statementCase.id} CSV row ${index + 1}: description matches on-screen`)
    assert.equal(Number(csvRows[index].Withdrawal || 0) || undefined, row.withdrawal, `${statementCase.id} CSV row ${index + 1}: withdrawal matches on-screen`)
    assert.equal(Number(csvRows[index].Deposit || 0) || undefined, row.deposit, `${statementCase.id} CSV row ${index + 1}: deposit matches on-screen`)
    assert.equal(Number(csvRows[index].Balance || 0) || undefined, row.balance, `${statementCase.id} CSV row ${index + 1}: balance matches on-screen`)

    assert.equal(excelRows[index].Date, row.date ?? '', `${statementCase.id} Excel row ${index + 1}: date matches on-screen`)
    assert.equal(excelRows[index].Description, row.description, `${statementCase.id} Excel row ${index + 1}: description matches on-screen`)
    assert.equal(Number(excelRows[index].Withdrawal || 0) || undefined, row.withdrawal, `${statementCase.id} Excel row ${index + 1}: withdrawal matches on-screen`)
    assert.equal(Number(excelRows[index].Deposit || 0) || undefined, row.deposit, `${statementCase.id} Excel row ${index + 1}: deposit matches on-screen`)
    assert.equal(Number(excelRows[index].Balance || 0) || undefined, row.balance, `${statementCase.id} Excel row ${index + 1}: balance matches on-screen`)

    const posted = row.date?.replaceAll('-', '') ?? ''
    assert.equal(qboRows[index].date, posted, `${statementCase.id} QBO row ${index + 1}: date matches on-screen`)
    assert.equal(qboRows[index].amount, row.amount, `${statementCase.id} QBO row ${index + 1}: amount matches on-screen`)
    assert.equal(qboRows[index].description, row.description.slice(0, 32), `${statementCase.id} QBO row ${index + 1}: description matches on-screen`)
  })

  if (statementCase.status === 'review') {
    assert.match(csvRows[0]['Review Status'], /Needs review/i, `${statementCase.id}: failed row is not Verified in CSV`)
    assert.match(String(excelRows[0]['Review Status']), /Needs review/i, `${statementCase.id}: failed row is not Verified in Excel`)
  }
}

function parseCsvLine(line) {
  return line.slice(1, -1).split('","').map((value) => value.replaceAll('""', '"'))
}
