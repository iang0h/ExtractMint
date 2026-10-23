import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createMultilineStatement } from './fixtures/multiline-statement.mjs'
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
  for (const pageBreak of [false, true]) {
    const fixture = createMultilineStatement({ pageBreak })
    const result = converter.parseExtractedText(fixture.text, 'invented-multiline-statement.txt', 'text/plain', { size: fixture.text.length, lastModified: 1 })
    const transactions = result.rows.filter((row) => row.date && row.amount !== undefined)
    const deposits = Math.round(transactions.reduce((sum, row) => sum + (row.deposit ?? 0), 0) * 100) / 100
    const withdrawals = Math.round(transactions.reduce((sum, row) => sum + (row.withdrawal ?? 0), 0) * 100) / 100
    console.log(`Multiline fixture (pageBreak=${pageBreak}): ${transactions.length} transactions; deposits=${deposits.toFixed(2)}; withdrawals=${withdrawals.toFixed(2)}; dated rows=${result.rows.filter((row) => row.date).length}`)
    assert.equal(transactions.length, fixture.transactionCount, 'multiline fixture: exact gold transaction count')
    assert.equal(result.rows.filter((row) => row.date).length, fixture.transactionCount, 'dated memo must not create a bogus row')
    assert.equal(deposits, fixture.deposits, 'multiline fixture: exact gold deposit total')
    assert.equal(withdrawals, fixture.withdrawals, 'multiline fixture: exact gold withdrawal total')
    let balance = fixture.openingBalance
    transactions.forEach((row, index) => {
      balance = Math.round((balance + row.amount) * 100) / 100
      assert.equal(row.balance, balance, `multiline fixture: balance step ${index + 1}`)
      assert.equal(row.description, fixture.descriptions[index], `multiline fixture: full description ${index + 1}, including across page break`)
      assert.deepEqual(row.sourceLineNumbers, fixture.transactionSourceLines[index], 'every transaction source line stays attached')
    })
    assert.equal(balance, fixture.closingBalance)
    assert.equal(result.validation.status, 'valid')
    assert.deepEqual(result.provenance.unattachedLineNumbers, [], 'no consumed source line is silently lost')
    assert.equal(result.provenance.rowStartLineNumbers.length, result.rows.length)
    assert.deepEqual([...result.provenance.attachedLineNumbers].sort((a, b) => a - b), result.provenance.consumedLineNumbers)
  }

  const multiline = createMultilineStatement()
  const splitCells = multiline.text.split('\n')
  const firstTransactionLine = splitCells.findIndex((line) => line.startsWith('01/06/2026\t'))
  const firstCells = splitCells[firstTransactionLine].split('\t')
  splitCells[firstTransactionLine] = firstCells.slice(0, 6).join('\t')
  splitCells.splice(firstTransactionLine + 1, 0, `\t\t\t\t\t\t${firstCells[6]}`)
  const splitResult = converter.parseExtractedText(splitCells.join('\n'), 'invented-split-cells.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(splitResult.rows[1].balance, 399999.99, 'amount and balance on different physical lines attach to the same transaction')
  assert.deepEqual(splitResult.provenance.unattachedLineNumbers, [], 'split financial cells leave no unattached line')
  const repeatedDetail = 'Fictional remittance detail with a long invented project name and a synthetic scheduling note.'
  const longDescriptionText = multiline.text.replace('\tFictional detail 1.1', Array.from({ length: 5 }, () => `\t${repeatedDetail}`).join('\n'))
  const longDescription = converter.parseExtractedText(longDescriptionText, 'invented-long-description.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(longDescription.rows[1].description, `Invented transfer 1 ${Array(5).fill(repeatedDetail).join(' ')}`, 'all five description continuations are retained, including repeated and long text')
  const plainText = [
    'Cloudberry Test Bank synthetic statement USD',
    'OPENING BALANCE 1,000.00',
    '01/06/2026 Fictional debit -5.00 995.00',
    'Memo for 12/07/2026 project estimate 999.99',
    '12/07/2026 scheduled memo 777.77 only',
    '02/06/2026 Fictional credit +5.00 1,000.00',
    'CLOSING BALANCE 1,000.00',
  ].join('\n')
  const plainResult = converter.parseExtractedText(plainText, 'invented-plain-statement.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(plainResult.rows.filter((row) => row.date).length, 2, 'unstructured date-like memos do not create transactions')
  assert.match(plainResult.rows[1].description, /Memo for 12\/07\/2026 project estimate 999\.99 12\/07\/2026 scheduled memo 777\.77 only/)
  assert.deepEqual(plainResult.rows[1].sourceLineNumbers, [3, 4, 5], 'plain fallback records attached source lines')
  assert.deepEqual(plainResult.provenance.unattachedLineNumbers, [])

  const trailingMemoText = plainText.replace('12/07/2026 scheduled memo 777.77 only', '12/07/2026 scheduled memo 777.77')
  const trailingMemoResult = converter.parseExtractedText(trailingMemoText, 'invented-trailing-memo-statement.txt', 'text/plain', { size: 100, lastModified: 1 })
  const trailingMemoTransactions = trailingMemoResult.rows.filter((row) => row.date)
  console.log(`Trailing-money memo review regression: ${trailingMemoTransactions.length} transactions; amounts=${trailingMemoTransactions.map((row) => row.amount).join(',')}; validation=${trailingMemoResult.validation.status}`)
  assert.equal(trailingMemoTransactions.length, 2, 'dated memo ending in an unsigned amount must not create a third transaction')
  assert.deepEqual(trailingMemoTransactions.map((row) => [row.date, row.amount, row.balance]), [
    ['01/06/2026', -5, 995],
    ['02/06/2026', 5, 1000],
  ], 'actual statement dates, amounts, and balances remain unchanged')
  assert.equal(trailingMemoTransactions[0].description, 'Fictional debit Memo for 12/07/2026 project estimate 999.99 12/07/2026 scheduled memo 777.77', 'full trailing-money memo remains attached to its source transaction')
  assert.deepEqual(trailingMemoTransactions[0].sourceLineNumbers, [3, 4, 5], 'trailing-money memo source line stays attached')
  assert.deepEqual(trailingMemoResult.provenance.unattachedLineNumbers, [], 'review fix preserves all consumed source data')
  assert.equal(trailingMemoResult.validation.status, 'review', 'ambiguous dated-money text is flagged even when actual running-balance steps reconcile')
  assert.deepEqual(trailingMemoResult.provenance.ambiguousLineNumbers, [5])
  assert.equal((await converter.createQboBlob(trailingMemoResult).text()).match(/<STMTTRN>/g)?.length, 2, 'QBO contains only the two actual transactions')

  for (const memoAmount of ['-999.99', '(999.99)']) {
    const signedMemoText = plainText.replace('12/07/2026 scheduled memo 777.77 only', `12/07/2026 scheduled memo ${memoAmount}`)
    const signedMemo = converter.parseExtractedText(signedMemoText, 'invented-signed-memo.txt', 'text/plain', { size: 100, lastModified: 1 })
    const signedMemoTransactions = signedMemo.rows.filter((row) => row.date)
    assert.equal(signedMemoTransactions.length, 2, 'a sign or parentheses alone cannot turn a dated memo into a transaction')
    assert.deepEqual(signedMemoTransactions.map((row) => [row.amount, row.balance]), [[-5, 995], [5, 1000]], 'signed memo keeps actual transaction values unchanged')
    assert.ok(signedMemoTransactions[0].description.endsWith(`12/07/2026 scheduled memo ${memoAmount}`), 'signed memo text remains full description evidence')
    assert.deepEqual(signedMemoTransactions[0].sourceLineNumbers, [3, 4, 5])
    assert.equal(signedMemo.validation.status, 'review', 'unsupported dated-money line stays visible for source review')
    assert.deepEqual(signedMemo.provenance.ambiguousLineNumbers, [5], 'source coverage identifies ambiguous transaction starts')
  }
  for (const twoMoneyMemo of [
    '12/07/2026 scheduled memo estimate 123.45 revised -999.99',
    '12/07/2026 scheduled memo estimate 123.45 revised 999.99',
    '12/07/2026 scheduled memo estimate 123.45 revised (999.99)',
    '12/07/2026 scheduled memo 123.45 -999.99',
    '12/07/2026 scheduled memo -123.45 -999.99',
    '12/07/2026 scheduled memo (123.45) -999.99',
  ]) {
    const twoMoneyText = plainText.replace('12/07/2026 scheduled memo 777.77 only', twoMoneyMemo)
    const twoMoneyResult = converter.parseExtractedText(twoMoneyText, 'invented-two-money-memo.txt', 'text/plain', { size: 100, lastModified: 1 })
    const actualTransactions = twoMoneyResult.rows.filter((row) => row.date)
    console.log(`Two-money memo (${twoMoneyMemo}): ${actualTransactions.length} transactions; amounts=${actualTransactions.map((row) => row.amount).join(',')}`)
    assert.equal(actualTransactions.length, 2, 'a date and two money tokens without supporting context do not prove a transaction start')
    assert.deepEqual(actualTransactions.map((row) => [row.date, row.amount, row.balance]), [['01/06/2026', -5, 995], ['02/06/2026', 5, 1000]])
    assert.ok(actualTransactions[0].description.endsWith(twoMoneyMemo), 'both numeric tokens and intervening prose remain in the source description')
    assert.deepEqual(actualTransactions[0].sourceLineNumbers, [3, 4, 5])
    assert.deepEqual(twoMoneyResult.provenance.ambiguousLineNumbers, [5])
    assert.equal(twoMoneyResult.validation.status, 'review')
    assert.equal((await converter.createQboBlob(twoMoneyResult).text()).match(/<STMTTRN>/g)?.length, 2, 'two-money memo cannot add an OFX transaction')
  }

  const unsignedMemoLine = '12/07/2026 scheduled memo 123.45 999.99'
  const unsignedHeaderless = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    'OPENING BALANCE 1,000.00',
    '01/06/2026 Fictional credit 5.00 1,005.00',
    unsignedMemoLine,
    '02/06/2026 Fictional credit 5.00 1,010.00',
  ].join('\n'), 'invented-unsigned-headerless-memo.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.deepEqual(unsignedHeaderless.rows.filter((row) => row.date).map((row) => [row.amount, row.balance]), [[5, 1005], [5, 1010]], 'repeated unsigned presentation is not independent evidence for a memo transaction')
  assert.ok(unsignedHeaderless.rows[1].description.endsWith(unsignedMemoLine))
  assert.deepEqual(unsignedHeaderless.provenance.ambiguousLineNumbers, [4])
  assert.equal(unsignedHeaderless.validation.status, 'review')

  const unsupportedOnly = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    '12/07/2026 scheduled memo -999.99',
    '13/07/2026 allocated memo (999.99)',
  ].join('\n'), 'invented-no-layout-no-balances.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(unsupportedOnly.rows.filter((row) => row.amount !== undefined).length, 0, 'unsupported dated-money lines never become fallback money rows')
  assert.equal(unsupportedOnly.validation.status, 'review')
  assert.deepEqual(unsupportedOnly.provenance.ambiguousLineNumbers, [2, 3])
  assert.match(unsupportedOnly.rows.map((row) => row.description).join(' '), /scheduled memo -999\.99.*allocated memo \(999\.99\)/, 'unsupported source text remains available for review')

  const wrongPairBalance = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    'Date Description Amount Balance',
    'OPENING BALANCE 1,000.00',
    '01/06/2026 Fictional debit -5.00 994.00',
    '02/06/2026 Fictional credit +5.00 1,000.00',
  ].join('\n'), 'invented-wrong-pair-balance.txt', 'text/plain', { size: 100, lastModified: 1 })
  const wrongPairTransactions = wrongPairBalance.rows.filter((row) => row.date)
  console.log(`Wrong-pair-balance regression: ${wrongPairTransactions.length} transactions; amounts=${wrongPairTransactions.map((row) => row.amount).join(',')}; validation=${wrongPairBalance.validation.status}`)
  assert.deepEqual(wrongPairTransactions.map((row) => [row.amount, row.balance]), [[-5, 994], [5, 1000]], 'established paired layout preserves source rows even when balances do not reconcile')
  assert.equal(wrongPairBalance.validation.status, 'review')
  assert.deepEqual(wrongPairBalance.validation.issues.filter((issue) => issue.code === 'balance-step-inconsistency').map((issue) => issue.delta), [-1, 1], 'validator flags both wrong source balance steps instead of deleting a row')
  assert.deepEqual(wrongPairBalance.provenance.ambiguousLineNumbers, [], 'explicit source header preserves transaction layout despite a balance mismatch')
  const wrongPairCsv = (await converter.createCsvBlob(wrongPairBalance).text()).split(/\r?\n/).map(parseCsvLine)
  const wrongPairHeaders = wrongPairCsv[0]
  assert.deepEqual(wrongPairCsv.slice(1).filter((row) => row[wrongPairHeaders.indexOf('Date')]).map((row) => [Number(row[wrongPairHeaders.indexOf('Amount')]), Number(row[wrongPairHeaders.indexOf('Balance')])]), [[-5, 994], [5, 1000]], 'CSV preserves the inconsistent source balance and both actual amounts')

  const wrongPairQbo = await converter.createQboBlob(wrongPairBalance).text()
  assert.deepEqual([...wrongPairQbo.matchAll(/<TRNAMT>([^\r\n]+)/g)].map((match) => Number(match[1])), [-5, 5], 'QBO retains both source movements while the UI carries the balance warning')

  const pairedWithoutOpening = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    'Date Description Amount Balance',
    '01/06/2026 Fictional debit -5.00 995.00',
    '02/06/2026 Fictional credit +5.00 1,000.00',
  ].join('\n'), 'invented-no-opening-pairs.txt', 'text/plain', { size: 100, lastModified: 1 })
  const noOpeningTransactions = pairedWithoutOpening.rows.filter((row) => row.date)
  console.log(`No-opening pair regression: ${noOpeningTransactions.length} transactions; amounts=${noOpeningTransactions.map((row) => row.amount).join(',')}`)
  assert.deepEqual(noOpeningTransactions.map((row) => [row.date, row.amount, row.balance]), [['01/06/2026', -5, 995], ['02/06/2026', 5, 1000]], 'explicit source header preserves actual paired transactions without an opening balance')
  assert.deepEqual(noOpeningTransactions.map((row) => row.sourceLineNumbers), [[3], [4]])
  assert.deepEqual(pairedWithoutOpening.provenance.ambiguousLineNumbers, [])
  const noOpeningCsv = (await converter.createCsvBlob(pairedWithoutOpening).text()).split(/\r?\n/).map(parseCsvLine)
  const noOpeningAmountColumn = noOpeningCsv[0].indexOf('Amount')
  assert.deepEqual(noOpeningCsv.slice(1).map((row) => Number(row[noOpeningAmountColumn])), [-5, 5], 'CSV preserves both no-opening source amounts')
  assert.deepEqual([...((await converter.createQboBlob(pairedWithoutOpening).text()).matchAll(/<TRNAMT>([^\r\n]+)/g))].map((match) => Number(match[1])), [-5, 5], 'QBO preserves both no-opening source amounts')

  const sparsePlain = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    'OPENING BALANCE 1,000.00',
    '01/06/2026 Fictional debit -5.00 995.00',
    '02/06/2026 Fictional debit -2.00',
    '03/06/2026 Fictional credit +7.00 1,000.00',
  ].join('\n'), 'invented-sparse-plain.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(sparsePlain.rows.filter((row) => row.date).length, 3, 'plain fallback retains a dated transaction with a trailing amount even when balance is absent')
  assert.equal(sparsePlain.rows[2].amount, -2, 'sparse plain source amount is preserved')
  console.log(`Sparse balance review regression: amounts=${sparsePlain.rows.filter((row) => row.date).map((row) => row.amount).join(',')}; validation=${sparsePlain.validation.status}; issues=${sparsePlain.validation.issueCount}`)
  assert.equal(sparsePlain.validation.status, 'valid', 'the balance step includes the intervening parsed -2.00 transaction')
  assert.equal(sparsePlain.validation.issueCount, 0)
  assert.equal(sparsePlain.validation.checkedRows, 2, 'both observed balance intervals are checked')
  assert.equal(sparsePlain.rows[2].balance, undefined, 'validation never supplies an invented intermediate balance')
  assert.equal(sparsePlain.rows[1].balance + sparsePlain.rows[2].amount + sparsePlain.rows[3].amount, sparsePlain.rows[3].balance, '995 - 2 + 7 equals the source closing balance 1000 exactly')
  const sparseOneCentError = sparsePlain.rows.map((row, index) => index === 3 ? { ...row, balance: 1000.01 } : row)
  const sparseOneCentValidation = converter.revalidateRows(sparseOneCentError, 'USD')
  assert.equal(sparseOneCentValidation.status, 'review', 'including intervening amounts does not relax the cent-level guard')
  assert.equal(sparseOneCentValidation.issues[0].delta, 0.01)

  const supportedUnsigned = converter.parseExtractedText([
    'Cloudberry Test Bank synthetic statement USD',
    'OPENING BALANCE 1,000.00',
    '01/06/2026 Fictional debit -5.00 995.00',
    '02/06/2026 Fictional credit 2.00',
    '03/06/2026 Fictional credit +3.00 1,000.00',
  ].join('\n'), 'invented-supported-unsigned.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.deepEqual(supportedUnsigned.rows.filter((row) => row.date).map((row) => row.amount), [-5, 2, 3], 'surrounding balance evidence retains a genuine unsigned sparse transaction unchanged')
  assert.equal(supportedUnsigned.validation.status, 'valid', 'supported unsigned sparse interval also reconciles')
  assert.equal(supportedUnsigned.validation.issueCount, 0)

  const inconsistent = converter.parseExtractedText(
    multiline.text.replace('399,999.99', '399,998.99'),
    'invented-inconsistent-statement.txt', 'text/plain', { size: 100, lastModified: 1 },
  )
  assert.equal(inconsistent.rows.filter((row) => row.amount !== undefined).length, multiline.transactionCount, 'inconsistency guard never invents or deletes rows')
  assert.equal(inconsistent.rows[1].amount, -0.01, 'guard preserves the stated tiny withdrawal')
  assert.equal(inconsistent.rows[1].balance, 399998.99, 'guard preserves the inconsistent source balance')
  assert.equal(inconsistent.validation.issues.filter((issue) => issue.code === 'balance-step-inconsistency').length, 2, 'a misread middle balance flags each unexplained step')
  const integrity = await server.ssrLoadModule('/src/lib/statementIntegrity.ts')
  const ambiguousWarning = integrity.getStatementIntegrityWarning(trailingMemoResult)
  assert.match(ambiguousWarning, /Ambiguous transaction starts on source lines: 5/)
  assert.match(await converter.createCsvBlob(trailingMemoResult).text(), /Ambiguous transaction starts on source lines: 5/, 'ambiguous source warning carries into CSV')
  const restoredMemo = await converter.importReviewJson(new File([converter.createReviewJsonBlob(trailingMemoResult)], 'invented-memo.extractmint-review.json', { type: 'application/json' }))
  assert.deepEqual(restoredMemo.provenance.ambiguousLineNumbers, [5], 'review round trip preserves ambiguous source locations')
  assert.equal(restoredMemo.validation.status, 'review', 'review import restores the ambiguity warning')
  assert.equal(integrity.getStatementIntegrityWarning(restoredMemo), ambiguousWarning)
  const warning = integrity.getStatementIntegrityWarning(inconsistent)
  assert.match(warning, /balance.step inconsistency/i)
  assert.match(warning, /not proof.*missing/i, 'warning does not diagnose a missing row from a balance mismatch')
  assert.match(warning, /net.zero/i, 'warning explains the limit of balance-only completeness checks')
  const warningCsv = await converter.createCsvBlob(inconsistent).text()
  const warningCsvLines = warningCsv.split(/\r?\n/).map(parseCsvLine)
  const warningColumn = warningCsvLines[0].indexOf('Statement Warnings')
  assert.ok(warningColumn >= 0, 'CSV carries an explicit statement warning column')
  assert.equal(warningCsvLines[1][warningColumn], warning, 'warning persists even on rows with no row-level issue')
  const WarningExcelJS = (await import('exceljs')).default
  const warningWorkbook = new WarningExcelJS.Workbook()
  await warningWorkbook.xlsx.load(Buffer.from(await (await converter.createExcelBlob(inconsistent)).arrayBuffer()))
  for (const sheetName of ['Summary', 'Reconciliation']) {
    assert.ok(JSON.stringify(warningWorkbook.getWorksheet(sheetName).getSheetValues()).includes(warning), `XLSX ${sheetName} carries the balance inconsistency warning`)
  }
  const warningCombined = new WarningExcelJS.Workbook()
  await warningCombined.xlsx.load(Buffer.from(await (await converter.createCombinedExcelBlob([inconsistent])).arrayBuffer()))
  for (const sheetName of ['Summary', 'Reconciliation']) {
    assert.ok(JSON.stringify(warningCombined.getWorksheet(sheetName).getSheetValues()).includes(warning), `Combined XLSX ${sheetName} carries the warning`)
  }
  const inconsistentQbo = await converter.createQboBlob(inconsistent).text()
  assert.equal((inconsistentQbo.match(/<STMTTRN>/g) ?? []).length, multiline.transactionCount, 'QBO has exact source transactions')
  assert.doesNotMatch(inconsistentQbo, /WARNING|INCONSISTENCY|FAKE|MISSINGROW/i, 'QBO adds no unsupported warning tags or fake transactions')
  const oneCentError = converter.parseExtractedText(
    multiline.text.replace('399,999.99', '399,999.98'),
    'invented-one-cent-inconsistency.txt', 'text/plain', { size: 100, lastModified: 1 },
  )
  assert.equal(oneCentError.validation.issues.filter((issue) => issue.code === 'balance-step-inconsistency').length, 2, 'a one-cent balance mismatch is still an inconsistency')
  const closingError = converter.parseExtractedText(
    multiline.text.replace('\tCLOSING BALANCE\t\t\t\t\t400,000.00', '\tCLOSING BALANCE\t\t\t\t\t399,999.99'),
    'invented-closing-inconsistency.txt', 'text/plain', { size: 100, lastModified: 1 },
  )
  assert.equal(closingError.validation.status, 'review', 'unexplained closing balance step requires review')
  const cleanMultiline = converter.parseExtractedText(multiline.text, 'invented-clean.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.equal(integrity.getStatementIntegrityWarning(cleanMultiline), undefined, 'clean source has no inconsistency warning')
  const orphanText = multiline.text.split('\n')
  orphanText.splice(5, 0, '\t\tORPHAN-FICTION-REF')
  const orphan = converter.parseExtractedText(orphanText.join('\n'), 'invented-orphan.txt', 'text/plain', { size: 100, lastModified: 1 })
  assert.deepEqual(orphan.provenance.unattachedLineNumbers, [6], 'consumed but unattached source line is explicitly recorded')
  assert.equal(orphan.validation.status, 'review', 'unattached source data requires review even when balances match')
  assert.match(integrity.getStatementIntegrityWarning(orphan), /unattached.*6/i, 'unattached source line warning identifies its location')
  const orphanJson = converter.createReviewJsonBlob(orphan)
  const restoredOrphan = await converter.importReviewJson(new File([orphanJson], 'invented-orphan.extractmint-review.json', { type: 'application/json' }))
  assert.deepEqual(restoredOrphan.provenance, orphan.provenance, 'review JSON round trip preserves source coverage')
  assert.deepEqual(restoredOrphan.rows.map((row) => row.sourceLineNumbers), orphan.rows.map((row) => row.sourceLineNumbers), 'review JSON preserves row provenance')
  assert.equal(integrity.getStatementIntegrityWarning(restoredOrphan), integrity.getStatementIntegrityWarning(orphan), 'unattached source warning survives review import')
  const appSource = readFileSync(resolve(projectRoot, 'src/App.tsx'), 'utf8')
  assert.match(appSource, /role="alert"[\s\S]*?getStatementIntegrityWarning\(activeResult\)/, 'on-screen alert renders the same warning')
  assert.match(appSource, /format === 'qbo'[\s\S]*?window\.confirm/, 'QBO warns on screen before download')
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
