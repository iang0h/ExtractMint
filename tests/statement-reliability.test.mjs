import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createColumnStatement, createImageOnlyStatementPdf, reliabilityMagnitudes } from './fixtures/statement-reliability.mjs'

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
  const rowEditing = await server.ssrLoadModule('/src/lib/rowEditing.ts')
  const scanWarning = await server.ssrLoadModule('/src/lib/scanWarning.ts')
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
    assert.equal(result.validation.issueCount, 0, `${fixture.id}: no validation issues remain`)
    assert.equal(
      transactions.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0),
      0,
      `${fixture.id}: all five deposits and withdrawals cancel without inferred repair`,
    )
    if (fixture.multiPage) {
      assert.deepEqual(result.pdfColumnMethods, [{ page: 1, method: 'header' }, { page: 2, method: 'header' }])
    }
  }

  const builtInSampleFile = new File(
    [readFileSync(resolve(projectRoot, 'public/samples/synthetic-bank-statement.pdf'))],
    'synthetic-bank-statement.pdf',
    { type: 'application/pdf', lastModified: 1 },
  )
  const [builtInSample] = await converter.convertFiles([builtInSampleFile], () => {}, { persistOcrCache: false })
  const sampleTransactions = builtInSample.rows.filter((row) => row.date && row.amount !== undefined)
  assert.equal(builtInSample.validation.openingBalance, 1000, 'built-in synthetic sample uses its stated opening balance')
  assert.deepEqual(sampleTransactions.map((row) => row.withdrawal ?? row.deposit), [125.5, 300, 62], 'built-in synthetic sample assigns transaction columns')
  assert.equal(builtInSample.validation.closingBalance, 1112.5, 'built-in synthetic sample uses its stated closing balance')
  assert.equal(
    builtInSample.validation.openingBalance +
      sampleTransactions.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0) -
      builtInSample.validation.closingBalance,
    0,
    'built-in synthetic sample has a $0.00 reconciliation discrepancy',
  )
  assert.deepEqual(builtInSample.pdfColumnMethods, [{ page: 1, method: 'clusters' }], 'sample uses a fallback because it has no amount headers')
  assert.equal(builtInSample.validation.status, 'review', 'fallback assignment remains visible as needs review')
  assert.ok(builtInSample.confidence < 98, 'fallback assignment does not receive full confidence')

  const headerlessFile = new File([createColumnStatement({ includeHeaders: false })], 'synthetic-headerless.pdf', {
    type: 'application/pdf',
    lastModified: 1,
  })
  const [headerless] = await converter.convertFiles([headerlessFile], () => {}, { persistOcrCache: false })
  assert.ok(headerless.rows.length > 0, 'headerless synthetic statement still returns rows')
  assert.ok(headerless.confidence < 80, 'headerless column fallback lowers confidence')
  assert.equal(headerless.validation.status, 'review', 'headerless column fallback requires review')
  assert.ok(
    headerless.rows.every((row, index) => !row.date || review.getRowReview(headerless.validation, index).status !== 'Verified'),
    'fallback-assigned transaction rows never receive a Verified badge',
  )

  const imageOnlyBytes = createImageOnlyStatementPdf()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const imageOnlyDocument = await pdfjs.getDocument({ data: imageOnlyBytes }).promise
  const imageOnlyPage = await imageOnlyDocument.getPage(1)
  const imageOnlyContent = await imageOnlyPage.getTextContent()
  assert.equal(imageOnlyContent.items.filter((item) => item.str?.trim()).length, 0, 'scan fixture contains no selectable text')
  await imageOnlyDocument.destroy()

  const imageOnlyOcrText = [
    'Testbank Synthetic Statement',
    'Account: 0000000427 | Account holder: Avery Example',
    'Statement period: 03/04/2026 to 05/04/2026',
    'OPENING BALANCE 1,000.00',
    '03/04/2026 Synthetic debit (40.00) 960.00',
    '04/04/2026 Important notice: statement information changes on 05/04/2026',
    '04/04/2026 Synthetic row unreadable',
    '05/04/2026 Synthetic credit +50.00 1,010.00',
    'CLOSING BALANCE 1,010.00',
    'Page 1 of 1',
  ].join('\n')
  const scanResult = converter.parseExtractedText(
    imageOnlyOcrText,
    'synthetic-image-only-statement.pdf',
    'application/pdf',
    { size: imageOnlyBytes.length, lastModified: 1 },
    [{ page: 1, method: 'ocr' }],
  )
  assert.equal(scanResult.rows.filter((row) => row.date).length, 2, 'dated notice and unreadable row are excluded from transactions')
  assert.ok(!scanResult.rows.some((row) => /important notice|unreadable/i.test(row.description)), 'notice text is not exported as a transaction')
  assert.equal(scanResult.validation.openingBalance, 1000, 'scanned statement uses its stated opening balance')
  assert.equal(scanResult.validation.closingBalance, 1010, 'scanned statement uses its stated closing balance')
  assert.match(scanResult.scanQualityWarning, /amounts could not be read/i, 'missing OCR amount creates a clear warning')
  assert.match(scanResult.scanQualityWarning, /clearer scan or a text-based PDF/i, 'warning gives users a practical next step')
  assert.equal(scanResult.validation.status, 'review', 'incomplete scan needs review')
  assert.ok(scanResult.confidence < 70, 'incomplete scan lowers confidence')
  assert.equal(
    scanWarning.hasUnacknowledgedScanWarning([scanResult], new Set()),
    true,
    'money export is blocked before acknowledging the scan warning',
  )
  assert.equal(
    scanWarning.hasUnacknowledgedScanWarning([scanResult], new Set([scanWarning.scanWarningKey(scanResult)])),
    false,
    'acknowledgement lets the user proceed with money exports',
  )
  const unreadableScan = converter.parseExtractedText(
    'Page 1',
    'synthetic-unreadable-scan.pdf',
    'application/pdf',
    { size: 20, lastModified: 1 },
    [{ page: 1, method: 'ocr' }],
  )
  assert.ok(unreadableScan.scanQualityWarning, 'completely unreadable OCR still shows an explicit warning')

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

  const changedAmountResult = rowEditing.updateConversionRow(reviewResult, 1, 'amount', '-105.00', converter)
  assert.equal(changedAmountResult.rows[1].amount, -105, 'amount correction updates signed amount')
  assert.equal(changedAmountResult.rows[1].withdrawal, 105, 'negative amount correction becomes a withdrawal')
  assert.equal(changedAmountResult.rows[1].category, 'Withdrawal', 'amount correction refreshes category')
  assert.equal(changedAmountResult.summary.total, 235, 'amount correction refreshes the displayed detected total')
  assert.equal(changedAmountResult.validation.status, 'review', 'amount correction re-runs validation')

  const correctedDirection = rowEditing.updateConversionRow(reviewResult, 2, 'amount', '40.00', converter)
  const correctedRows = rowEditing.updateConversionRow(correctedDirection, 4, 'amount', '-15.00', converter)
  assert.equal(correctedRows.rows[2].category, 'Deposit', 'changing a debit to a credit refreshes the row category')
  assert.equal(correctedRows.rows[4].category, 'Withdrawal', 'changing a credit to a debit refreshes the row category')
  assert.equal(correctedRows.validation.status, 'review', 'document-level notice remains visible after row corrections')
  assert.deepEqual(
    correctedRows.validation.issues.filter(({ rowIndex }) => rowIndex !== undefined),
    [],
    'corrected directions clear their row-level reconciliation issues',
  )
  assert.deepEqual(
    correctedRows.rows.map((_, index) => review.getRowReview(correctedRows.validation, index).status),
    ['Unvalidated', 'Verified', 'Verified', 'Verified', 'Verified'],
    'resolved rows earn Verified while the file-level warning remains in the summary',
  )
  await assertReviewExports(converter, correctedRows)

  const correctedDocx = await converter.createDocxBlob(correctedRows)
  const mammoth = await import('mammoth')
  const docxText = (await mammoth.extractRawText({ buffer: Buffer.from(await correctedDocx.arrayBuffer()) })).value
  assert.match(docxText, /Synthetic wrong debit direction/, 'DOCX includes the corrected row')
  assert.match(docxText, /40\.00/, 'DOCX includes the corrected amount')
  assert.match(docxText, /Deposit/, 'DOCX includes the updated category')

  const correctedPdf = await converter.createPdfBlob(correctedRows)
  const correctedPdfDocument = await pdfjs.getDocument({ data: await correctedPdf.arrayBuffer() }).promise
  const correctedPdfText = (await correctedPdfDocument.getPage(1)).getTextContent()
  const correctedPdfItems = (await correctedPdfText).items.map((item) => item.str).join(' ')
  assert.match(correctedPdfItems, /Synthetic wrong debit direction/, 'PDF includes the corrected row')
  assert.match(correctedPdfItems, /40\.00/, 'PDF includes the corrected amount')
  await correctedPdfDocument.destroy()

  const correctedReviewJson = JSON.parse(await converter.createReviewJsonBlob(correctedRows).text())
  assert.equal(correctedReviewJson.rows[2].category, 'Deposit', 'Review JSON includes the corrected category')
  assert.equal(correctedReviewJson.rows[2].deposit, 40, 'Review JSON includes the corrected direction')
  assert.equal(correctedReviewJson.rows[4].withdrawal, 15, 'Review JSON includes the corrected withdrawal')

  const correctedPack = await converter.createReviewPackZipBlob([correctedRows])
  const JSZip = (await import('jszip')).default
  const ExcelJS = (await import('exceljs')).default
  const pack = await JSZip.loadAsync(Buffer.from(await correctedPack.arrayBuffer()))
  const packedJsonFile = pack.file('extractmint-review-pack/synthetic-row-review.extractmint-review.json')
  assert.ok(packedJsonFile, 'Review pack includes the corrected review JSON')
  const packedJson = JSON.parse(await packedJsonFile.async('string'))
  assert.equal(packedJson.rows[2].category, 'Deposit', 'Review pack JSON includes the corrected category')
  const packedWorkbookFile = pack.file('extractmint-review-pack/synthetic-row-review.xlsx')
  assert.ok(packedWorkbookFile, 'Review pack includes a corrected workbook')
  const packedWorkbook = new ExcelJS.Workbook()
  await packedWorkbook.xlsx.load(await packedWorkbookFile.async('nodebuffer'))
  assert.equal(packedWorkbook.getWorksheet('Rows').getRow(4).getCell(11).value, 'Deposit', 'Review pack workbook includes the corrected category')

  const combinedWorkbook = new ExcelJS.Workbook()
  await combinedWorkbook.xlsx.load(Buffer.from(await (await converter.createCombinedExcelBlob([correctedRows, reviewResult])).arrayBuffer()))
  const combinedRows = combinedWorkbook.getWorksheet('synthetic-row-review')
  assert.ok(combinedRows, 'Combined XLSX includes each source file worksheet')
  assert.equal(combinedRows.getRow(4).getCell(11).value, 'Deposit', 'Combined XLSX includes the corrected category')

  const diagnostic = JSON.parse(await converter.createPrivacySafeDiagnosticBlob(correctedRows).text())
  assert.equal(diagnostic.parsing.hasAmount, true, 'Diagnostic reports extraction metadata')
  assert.equal(Object.hasOwn(diagnostic, 'rows'), false, 'Diagnostic does not include transaction rows')
  assert.equal(JSON.stringify(diagnostic).includes('Synthetic wrong debit direction'), false, 'Diagnostic does not disclose transaction descriptions')

  const correctedWorkbook = new ExcelJS.Workbook()
  await correctedWorkbook.xlsx.load(Buffer.from(await (await converter.createExcelBlob(correctedRows)).arrayBuffer()))
  const reconciliation = new Map()
  correctedWorkbook.getWorksheet('Reconciliation').eachRow((row, rowNumber) => {
    if (rowNumber > 1) reconciliation.set(String(row.getCell(1).value), row.getCell(2).value)
  })
  assert.equal(reconciliation.get('Deposits (sum)'), '$115.00', 'XLSX deposit total updates after direction correction')
  assert.equal(reconciliation.get('Withdrawals (sum)'), '$115.00', 'XLSX withdrawal total updates after direction correction')
  assert.equal(reconciliation.get('Transaction net (deposits - withdrawals)'), '$0.00', 'XLSX transaction net updates after direction correction')

  console.log('Statement reliability and export regressions passed.')
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

  result.rows.forEach((source, index) => {
    for (const [label, field] of [
      ['Date', 'date'],
      ['Description', 'description'],
      ['Withdrawal', 'withdrawal'],
      ['Deposit', 'deposit'],
      ['Amount', 'amount'],
      ['Balance', 'balance'],
      ['Category', 'category'],
    ]) {
      const expected = source[field] ?? ''
      const csvValue = csvRows[index][label] ?? ''
      const xlsxValue = xlsxRows[index][label] ?? ''
      assert.equal(typeof expected === 'number' ? Number(csvValue) : csvValue, expected, `CSV row ${index + 1} ${label} matches on-screen row`)
      assert.equal(typeof expected === 'number' ? Number(xlsxValue) : xlsxValue, expected, `XLSX row ${index + 1} ${label} matches on-screen row`)
    }
  })

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
