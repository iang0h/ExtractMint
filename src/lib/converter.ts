import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getPersistentOcrText, setPersistentOcrText } from './ocrCache'
import { attachPdfPasswordPrompt } from './pdfPasswordPrompt.mjs'

export type ProgressStage =
  | 'ready'
  | 'reading'
  | 'ocr'
  | 'extracting'
  | 'exporting'
  | 'complete'
  | 'error'

export type ProgressEvent = {
  fileName: string
  stage: ProgressStage
  percent: number
  detail: string
}

export type ExtractedRow = {
  date?: string
  description: string
  amount?: number
  withdrawal?: number
  deposit?: number
  tax?: number
  balance?: number
  reference?: string
  category: string
  confidence: number
  source: string
}

export type ValidationIssue = {
  severity: 'info' | 'warning' | 'error'
  message: string
  rowIndex?: number
  expectedBalance?: number
  actualBalance?: number
  delta?: number
}

export type ValidationSummary = {
  status: 'valid' | 'review' | 'missing'
  checkedRows: number
  issueCount: number
  openingBalance?: number
  closingBalance?: number
  issues: ValidationIssue[]
}

export type ConversionResult = {
  fileName: string
  fileType: string
  currencyCode: string
  currencyCodeDetected?: boolean
  statementPeriod?: {
    start?: string
    end?: string
    source: 'explicit' | 'inferred'
  }
  fileMeta: {
    size: number
    lastModified: number
    sha256?: string
  }
  rawText: string
  rows: ExtractedRow[]
  confidence: number
  validation: ValidationSummary
  processedAt: string
  summary: {
    title: string
    documentKind: string
    total?: number
    vendor?: string
    notes: string[]
  }
}

type ProgressCallback = (event: ProgressEvent) => void

type PdfPasswordRequestReason = 'required' | 'incorrect'

export type ExtractionOptions = {
  forceOcr?: boolean
  ocrLanguage?: string
  persistOcrCache?: boolean
  requestPdfPassword?: (
    fileName: string,
    reason: PdfPasswordRequestReason,
    signal?: AbortSignal,
  ) => Promise<string>
  onPdfDocumentLoaded?: (file: File, pdf: PDFDocumentProxy) => void
  signal?: AbortSignal
}

export type ReviewPackSource = {
  blob: Blob
  fileName: string
  mimeType: string
}

export type ReviewPackImport = {
  results: ConversionResult[]
  sourcesBySha: Record<string, ReviewPackSource>
}

const datePattern =
  /(?:\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b)/i
const amountPattern =
  /[-+]?(?:[$€£]\s*)?\(?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?|[-+]?(?:[$€£]\s*)?\(?\d+\.\d{2}\)?|[-+]?[$€£]\s*\(?\d+\)?/g

export function revalidateRows(rows: ExtractedRow[], currencyCode: string) {
  return validateBalances(rows, currencyCode)
}

export function refreshStatementPeriod(
  rows: ExtractedRow[],
  previous?: ConversionResult['statementPeriod'],
): ConversionResult['statementPeriod'] | undefined {
  if (previous?.source === 'explicit') return previous
  const inferred = inferStatementPeriodFromRows(rows)
  return inferred ? { ...inferred, source: 'inferred' } : undefined
}

export async function convertFiles(
  files: File[],
  onProgress: ProgressCallback,
  options: ExtractionOptions = {},
) {
  const results: ConversionResult[] = []

  for (let index = 0; index < files.length; index += 1) {
    if (options.signal?.aborted) {
      throw new DOMException('Conversion canceled', 'AbortError')
    }
    const file = files[index]
    const basePercent = Math.round((index / files.length) * 100)

    onProgress({
      fileName: file.name,
      stage: 'reading',
      percent: basePercent,
      detail: 'Reading file contents',
    })

    const rawText = await extractText(file, (event) => {
      onProgress({
        ...event,
        percent: Math.min(
          96,
          Math.round(basePercent + event.percent / Math.max(files.length, 1)),
        ),
      })
    }, options)

    onProgress({
      fileName: file.name,
      stage: 'reading',
      percent: Math.min(97, basePercent + 14),
      detail: 'Fingerprinting file',
    })

    const sha256 = await sha256Hex(file)

    onProgress({
      fileName: file.name,
      stage: 'extracting',
      percent: Math.min(98, basePercent + 18),
      detail: 'Finding rows, totals, and document signals',
    })

    results.push(
      parseRawText(rawText, file.name, file.type || extensionOf(file.name), {
        size: file.size,
        lastModified: file.lastModified,
        sha256,
      }),
    )
  }

  return results
}

export function createSampleResult(): ConversionResult {
  const sample = `
ExtractMint Business Checking
Statement period Apr 01 2026 - Apr 30 2026
04/02/2026 STRIPE PAYOUT INV-1082 8,420.00 24,991.20
04/05/2026 AWS CLOUD SERVICES (842.10) 24,149.10
04/08/2026 CLIENT ACME RETAINER 12,500.00 36,649.10
04/12/2026 NOTION LABS (96.00) 36,553.10
04/15/2026 PAYROLL RUN (7,840.00) 28,713.10
04/22/2026 WIRE INCOMING NORTHSTAR 9,600.00 38,313.10
04/28/2026 TOTAL FEES (45.00) 38,268.10
Ending balance 38,268.10
`

  return parseRawText(sample, 'sample-bank-statement.pdf', 'application/pdf', {
    size: sample.length,
    lastModified: Date.now(),
    sha256: 'sample',
  })
}

export async function createExcelBlob(result: ConversionResult) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ExtractMint'
  workbook.created = new Date()

  const numberOrNull = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const moneyFmt = '#,##0.00;[Red]-#,##0.00'

  const reconciliation = reconciliationForResult(result)

  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'File', key: 'file', width: 34 },
    { header: 'Kind', key: 'kind', width: 18 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Statement Start', key: 'statementStart', width: 18 },
    { header: 'Statement End', key: 'statementEnd', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Validation', key: 'validation', width: 18 },
    { header: 'Issues', key: 'issues', width: 12 },
    { header: 'SHA-256', key: 'sha256', width: 66 },
    { header: 'File size', key: 'size', width: 14 },
    { header: 'Last modified', key: 'lastModified', width: 22 },
    { header: 'Processed', key: 'processed', width: 26 },
  ]
  summary.addRow({
    file: result.fileName,
    kind: result.summary.documentKind,
    currency: result.currencyCode,
    statementStart: result.statementPeriod?.start ?? '',
    statementEnd: result.statementPeriod?.end ?? '',
    confidence: `${result.confidence}%`,
    total: result.summary.total,
    validation: validationLabel(result.validation.status),
    issues: result.validation.issueCount,
    sha256: result.fileMeta.sha256 ?? '',
    size: result.fileMeta.size,
    lastModified: result.fileMeta.lastModified
      ? new Date(result.fileMeta.lastModified).toISOString()
      : '',
    processed: result.processedAt,
  })
  result.validation.issues.forEach((issue) => {
    summary.addRow({
      file: issue.rowIndex !== undefined ? `Row ${issue.rowIndex + 1}` : 'Document',
      kind: issue.severity,
      currency: '',
      confidence: '',
      total: numberOrNull(issue.delta),
      validation: issue.message,
      issues: '',
      sha256: '',
      size: '',
      lastModified: '',
      processed: '',
    })
  })

  const reconciliationSheet = workbook.addWorksheet('Reconciliation')
  reconciliationSheet.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 24 },
    { header: 'Notes', key: 'notes', width: 66 },
  ]
  reconciliationSheet.addRows([
    {
      metric: 'Validation status',
      value: validationLabel(result.validation.status),
      notes:
        result.validation.status === 'valid'
          ? 'Opening/closing balances and row-by-row transitions are consistent.'
          : result.validation.status === 'review'
            ? 'At least one balance transition did not match; see Summary/Issues.'
            : 'Not enough balance data to fully validate transitions.',
    },
    {
      metric: 'Opening balance',
      value:
        reconciliation.openingBalance !== undefined
          ? money(reconciliation.openingBalance, result.currencyCode)
          : '',
      notes: 'First detected running balance (or explicit OPENING BALANCE row).',
    },
    {
      metric: 'Closing balance',
      value:
        reconciliation.closingBalance !== undefined
          ? money(reconciliation.closingBalance, result.currencyCode)
          : '',
      notes: 'Last detected running balance (or explicit CLOSING BALANCE row).',
    },
    {
      metric: 'Net change (closing - opening)',
      value:
        reconciliation.netChange !== undefined
          ? money(reconciliation.netChange, result.currencyCode)
          : '',
      notes: 'Expected to match Transaction net when rows are complete.',
    },
    {
      metric: 'Deposits (sum)',
      value: money(reconciliation.deposits, result.currencyCode),
      notes: 'Sum of detected deposit (credit) values.',
    },
    {
      metric: 'Withdrawals (sum)',
      value: money(reconciliation.withdrawals, result.currencyCode),
      notes: 'Sum of detected withdrawal (debit) values.',
    },
    {
      metric: 'Transaction net (deposits - withdrawals)',
      value: money(reconciliation.transactionNet, result.currencyCode),
      notes: 'Computed from detected deposit/withdrawal columns when available.',
    },
    {
      metric: 'Discrepancy (net change - transaction net)',
      value:
        reconciliation.discrepancy !== undefined
          ? money(reconciliation.discrepancy, result.currencyCode)
          : '',
      notes:
        reconciliation.discrepancy !== undefined && Math.abs(reconciliation.discrepancy) > 0.01
          ? 'Non-zero discrepancy suggests missing/incorrect transactions or balances.'
          : 'Zero (or near-zero) discrepancy.',
    },
    {
      metric: 'Rows detected',
      value: result.rows.length,
      notes: 'Number of structured rows exported in the Rows sheet.',
    },
    {
      metric: 'Balance transitions checked',
      value: result.validation.checkedRows,
      notes: 'Row-to-row transitions with enough data to validate balances.',
    },
    {
      metric: 'Issues',
      value: result.validation.issueCount,
      notes: 'Count of validation issues logged in the Summary sheet.',
    },
    {
      metric: 'Statement period',
      value: `${result.statementPeriod?.start ?? ''}${result.statementPeriod?.end ? ` → ${result.statementPeriod.end}` : ''}`,
      notes: result.statementPeriod?.source ? `Source: ${result.statementPeriod.source}` : '',
    },
    {
      metric: 'File SHA-256',
      value: result.fileMeta.sha256 ?? '',
      notes: 'Fingerprint for audit trail / repeat conversions.',
    },
    {
      metric: 'Processed at (UTC)',
      value: result.processedAt,
      notes: '',
    },
  ])

  const rows = workbook.addWorksheet('Rows')
  rows.columns = [
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Description', key: 'description', width: 46 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Withdrawal', key: 'withdrawal', width: 16 },
    { header: 'Deposit', key: 'deposit', width: 16 },
    { header: 'Tax', key: 'tax', width: 12 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Balance', key: 'balance', width: 16 },
    { header: 'Review Status', key: 'reviewStatus', width: 18 },
    { header: 'Review Notes', key: 'reviewNotes', width: 42 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Source', key: 'source', width: 18 },
  ]
  ;['withdrawal', 'deposit', 'tax', 'amount', 'balance'].forEach((key) => {
    const column = rows.getColumn(key)
    column.numFmt = moneyFmt
    column.alignment = { horizontal: 'right' }
  })
  result.rows.forEach((row, index) => {
    rows.addRow({
      date: row.date ?? '',
      description: row.description,
      reference: row.reference ?? '',
      withdrawal: numberOrNull(row.withdrawal),
      deposit: numberOrNull(row.deposit),
      tax: numberOrNull(row.tax),
      amount: numberOrNull(row.amount),
      balance: numberOrNull(row.balance),
      reviewStatus: rowReviewStatus(result.validation, index),
      reviewNotes: rowReviewNotes(result.validation, index),
      category: row.category,
      confidence: `${row.confidence}%`,
      source: row.source,
    })
  })
  ;[summary, rows].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  })
  reconciliationSheet.getRow(1).font = { bold: true }
  reconciliationSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function createCombinedExcelBlob(results: ConversionResult[]) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ExtractMint'
  workbook.created = new Date()

  const numberOrNull = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const moneyFmt = '#,##0.00;[Red]-#,##0.00'

  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'File', key: 'file', width: 34 },
    { header: 'Kind', key: 'kind', width: 18 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Statement Start', key: 'statementStart', width: 18 },
    { header: 'Statement End', key: 'statementEnd', width: 18 },
    { header: 'Rows', key: 'rows', width: 10 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Opening Balance', key: 'opening', width: 18 },
    { header: 'Closing Balance', key: 'closing', width: 18 },
    { header: 'Net Change', key: 'net', width: 16 },
    { header: 'Deposits', key: 'deposits', width: 16 },
    { header: 'Withdrawals', key: 'withdrawals', width: 16 },
    { header: 'Validation', key: 'validation', width: 18 },
    { header: 'Issues', key: 'issues', width: 10 },
    { header: 'SHA-256', key: 'sha256', width: 66 },
    { header: 'Processed', key: 'processed', width: 26 },
  ]

  const issuesSheet = workbook.addWorksheet('Issues')
  issuesSheet.columns = [
    { header: 'File', key: 'file', width: 34 },
    { header: 'Row', key: 'row', width: 10 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Delta', key: 'delta', width: 14 },
    { header: 'Expected', key: 'expected', width: 16 },
    { header: 'Actual', key: 'actual', width: 16 },
    { header: 'Message', key: 'message', width: 90 },
  ]

  const reconciliationSheet = workbook.addWorksheet('Reconciliation')
  reconciliationSheet.columns = [
    { header: 'File', key: 'file', width: 34 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Statement Start', key: 'statementStart', width: 18 },
    { header: 'Statement End', key: 'statementEnd', width: 18 },
    { header: 'Rows', key: 'rows', width: 10 },
    { header: 'Opening Balance', key: 'opening', width: 18 },
    { header: 'Closing Balance', key: 'closing', width: 18 },
    { header: 'Net Change', key: 'net', width: 16 },
    { header: 'Deposits', key: 'deposits', width: 16 },
    { header: 'Withdrawals', key: 'withdrawals', width: 16 },
    { header: 'Transaction Net', key: 'transactionNet', width: 16 },
    { header: 'Discrepancy', key: 'discrepancy', width: 16 },
    { header: 'Checked Rows', key: 'checkedRows', width: 14 },
    { header: 'Issues', key: 'issues', width: 10 },
    { header: 'Validation', key: 'validation', width: 18 },
  ]

  ;[
    { sheet: summary, keys: ['opening', 'closing', 'net', 'deposits', 'withdrawals'] },
    {
      sheet: reconciliationSheet,
      keys: [
        'opening',
        'closing',
        'net',
        'deposits',
        'withdrawals',
        'transactionNet',
        'discrepancy',
      ],
    },
    { sheet: issuesSheet, keys: ['delta', 'expected', 'actual'] },
  ].forEach(({ sheet, keys }) => {
    keys.forEach((key) => {
      const column = sheet.getColumn(key)
      column.numFmt = moneyFmt
      column.alignment = { horizontal: 'right' }
    })
  })

  const usedSheetNames = new Set<string>(['Summary', 'Issues'])

  for (const result of results) {
    const totals = totalsForResult(result)
    const opening = result.validation.openingBalance
    const closing = result.validation.closingBalance
    const net = opening !== undefined && closing !== undefined ? closing - opening : undefined

    summary.addRow({
      file: result.fileName,
      kind: result.summary.documentKind,
      currency: result.currencyCode,
      statementStart: result.statementPeriod?.start ?? '',
      statementEnd: result.statementPeriod?.end ?? '',
      rows: result.rows.length,
      confidence: `${result.confidence}%`,
      opening: numberOrNull(opening),
      closing: numberOrNull(closing),
      net: numberOrNull(net),
      deposits: numberOrNull(totals.deposit),
      withdrawals: numberOrNull(totals.withdrawal),
      validation: validationLabel(result.validation.status),
      issues: result.validation.issueCount,
      sha256: result.fileMeta.sha256 ?? '',
      processed: result.processedAt,
    })

    const reconciliation = reconciliationForResult(result)
    reconciliationSheet.addRow({
      file: result.fileName,
      currency: result.currencyCode,
      statementStart: result.statementPeriod?.start ?? '',
      statementEnd: result.statementPeriod?.end ?? '',
      rows: result.rows.length,
      opening: numberOrNull(reconciliation.openingBalance),
      closing: numberOrNull(reconciliation.closingBalance),
      net: numberOrNull(reconciliation.netChange),
      deposits: numberOrNull(reconciliation.deposits),
      withdrawals: numberOrNull(reconciliation.withdrawals),
      transactionNet: numberOrNull(reconciliation.transactionNet),
      discrepancy: numberOrNull(reconciliation.discrepancy),
      checkedRows: result.validation.checkedRows,
      issues: result.validation.issueCount,
      validation: validationLabel(result.validation.status),
    })

    result.validation.issues.forEach((issue) => {
      issuesSheet.addRow({
        file: result.fileName,
        row: issue.rowIndex !== undefined ? issue.rowIndex + 1 : '',
        severity: issue.severity,
        delta: numberOrNull(issue.delta),
        expected: numberOrNull(issue.expectedBalance),
        actual: numberOrNull(issue.actualBalance),
        message: issue.message,
      })
    })

    const rowsSheet = workbook.addWorksheet(uniqueSheetName(result.fileName, usedSheetNames))
    rowsSheet.columns = [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Description', key: 'description', width: 46 },
      { header: 'Reference', key: 'reference', width: 18 },
      { header: 'Withdrawal', key: 'withdrawal', width: 16 },
      { header: 'Deposit', key: 'deposit', width: 16 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Amount', key: 'amount', width: 16 },
      { header: 'Balance', key: 'balance', width: 16 },
      { header: 'Review Status', key: 'reviewStatus', width: 18 },
      { header: 'Review Notes', key: 'reviewNotes', width: 42 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Confidence', key: 'confidence', width: 16 },
      { header: 'Source', key: 'source', width: 18 },
    ]
    ;['withdrawal', 'deposit', 'tax', 'amount', 'balance'].forEach((key) => {
      const column = rowsSheet.getColumn(key)
      column.numFmt = moneyFmt
      column.alignment = { horizontal: 'right' }
    })
    result.rows.forEach((row, index) => {
      rowsSheet.addRow({
        date: row.date ?? '',
        description: row.description,
        reference: row.reference ?? '',
        withdrawal: numberOrNull(row.withdrawal),
        deposit: numberOrNull(row.deposit),
        tax: numberOrNull(row.tax),
        amount: numberOrNull(row.amount),
        balance: numberOrNull(row.balance),
        reviewStatus: rowReviewStatus(result.validation, index),
        reviewNotes: rowReviewNotes(result.validation, index),
        category: row.category,
        confidence: `${row.confidence}%`,
        source: row.source,
      })
    })
    rowsSheet.getRow(1).font = { bold: true }
    rowsSheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  ;[summary, issuesSheet].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  })
  reconciliationSheet.getRow(1).font = { bold: true }
  reconciliationSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function createCsvBlob(result: ConversionResult) {
  const rows = [
    [
      'Date',
      'Description',
      'Reference',
      'Withdrawal',
      'Deposit',
      'Tax',
      'Amount',
      'Balance',
      'Review Status',
      'Review Notes',
      'Category',
      'Confidence',
      'Source',
    ],
    ...result.rows.map((row, index) => [
      row.date ?? '',
      row.description,
      row.reference ?? '',
      String(row.withdrawal ?? ''),
      String(row.deposit ?? ''),
      String(row.tax ?? ''),
      String(row.amount ?? ''),
      String(row.balance ?? ''),
      rowReviewStatus(result.validation, index),
      rowReviewNotes(result.validation, index),
      row.category,
      `${row.confidence}%`,
      row.source,
    ]),
  ]
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n')

  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}

function totalsForResult(result: ConversionResult) {
  return {
    amount: result.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    withdrawal: result.rows.reduce((sum, row) => sum + (row.withdrawal ?? 0), 0),
    deposit: result.rows.reduce((sum, row) => sum + (row.deposit ?? 0), 0),
    tax: result.rows.reduce((sum, row) => sum + (row.tax ?? 0), 0),
  }
}

function reconciliationForResult(result: ConversionResult) {
  const totals = totalsForResult(result)
  const openingBalance = result.validation.openingBalance
  const closingBalance = result.validation.closingBalance
  const netChange =
    openingBalance !== undefined && closingBalance !== undefined
      ? roundMoney(closingBalance - openingBalance)
      : undefined

  const hasDebitCredit = result.rows.some(
    (row) => row.deposit !== undefined || row.withdrawal !== undefined,
  )
  const transactionNet = hasDebitCredit
    ? roundMoney(totals.deposit - totals.withdrawal)
    : roundMoney(totals.amount)

  const discrepancy =
    netChange !== undefined ? roundMoney(netChange - transactionNet) : undefined

  return {
    openingBalance,
    closingBalance,
    netChange,
    deposits: roundMoney(totals.deposit),
    withdrawals: roundMoney(totals.withdrawal),
    transactionNet,
    discrepancy,
  }
}

function uniqueSheetName(fileName: string, usedNames: Set<string>) {
  const baseName = (fileName.replace(/\.[^.]+$/, '') || 'Statement')
    .replace(/[\]\\[*?:/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const trimmed = baseName.slice(0, 31) || 'Statement'
  if (!usedNames.has(trimmed)) {
    usedNames.add(trimmed)
    return trimmed
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const suffixText = ` ${suffix}`
    const candidate = `${trimmed.slice(0, Math.max(0, 31 - suffixText.length))}${suffixText}`.trim()
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
  }

  const fallback = `Statement ${usedNames.size + 1}`.slice(0, 31)
  usedNames.add(fallback)
  return fallback
}

export function createQboBlob(result: ConversionResult) {
  const { startDate, endDate } = qboDateRange(result.rows, result.statementPeriod)
  const openingBalance = result.validation.openingBalance
  const closingBalance = result.validation.closingBalance ?? qboLastBalance(result.rows)

  const transactions = result.rows
    .map((row, index) => qboTransaction(row, index))
    .filter((entry): entry is string => Boolean(entry))
    .join('\n')

  const now = new Date()
  const dtServer = qboFormatDateTime(now)
  const fileId = qboUid(result.fileMeta.sha256 ?? `${result.fileName}-${result.processedAt}`)

  const parts: string[] = []
  parts.push(
    [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'VERSION:102',
      'SECURITY:NONE',
      'ENCODING:USASCII',
      'CHARSET:1252',
      'COMPRESSION:NONE',
      'OLDFILEUID:NONE',
      `NEWFILEUID:${fileId}`,
      '',
      '<OFX>',
      '<SIGNONMSGSRSV1>',
      '<SONRS>',
      '<STATUS>',
      '<CODE>0',
      '<SEVERITY>INFO',
      '</STATUS>',
      `<DTSERVER>${dtServer}`,
      '<LANGUAGE>ENG',
      '</SONRS>',
      '</SIGNONMSGSRSV1>',
      '<BANKMSGSRSV1>',
      '<STMTTRNRS>',
      '<TRNUID>1',
      '<STATUS>',
      '<CODE>0',
      '<SEVERITY>INFO',
      '</STATUS>',
      '<STMTRS>',
      `<CURDEF>${result.currencyCode || 'USD'}`,
      '<BANKACCTFROM>',
      '<BANKID>0000',
      '<ACCTID>0000000000',
      '<ACCTTYPE>CHECKING',
      '</BANKACCTFROM>',
      '<BANKTRANLIST>',
      startDate ? `<DTSTART>${startDate}` : '',
      endDate ? `<DTEND>${endDate}` : '',
      transactions,
      '</BANKTRANLIST>',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  if (closingBalance !== undefined) {
    parts.push(
      [
        '<LEDGERBAL>',
        `<BALAMT>${qboNumber(closingBalance)}`,
        endDate ? `<DTASOF>${endDate}` : `<DTASOF>${qboFormatDate(now)}`,
        '</LEDGERBAL>',
      ].join('\n'),
    )
  }

  if (openingBalance !== undefined) {
    parts.push(
      [
        '<AVAILBAL>',
        `<BALAMT>${qboNumber(openingBalance)}`,
        startDate ? `<DTASOF>${startDate}` : `<DTASOF>${qboFormatDate(now)}`,
        '</AVAILBAL>',
      ].join('\n'),
    )
  }

  parts.push(['</STMTRS>', '</STMTTRNRS>', '</BANKMSGSRSV1>', '</OFX>', ''].join('\n'))

  return new Blob([parts.join('\n')], { type: 'application/x-ofx' })
}

export async function createDocxBlob(result: ConversionResult) {
  const {
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')
  const tableRows = [
    new TableRow({
      children: [
        'Date',
        'Description',
        'Reference',
        'Withdrawal',
        'Deposit',
        'Tax',
        'Amount',
        'Balance',
        'Review Status',
        'Review Notes',
        'Type',
      ].map(
        (label) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
          }),
      ),
    }),
    ...result.rows.map(
      (row, index) =>
        new TableRow({
          children: [
            row.date ?? '',
            row.description,
            row.reference ?? '',
            money(row.withdrawal, result.currencyCode),
            money(row.deposit, result.currencyCode),
            money(row.tax, result.currencyCode),
            money(row.amount, result.currencyCode),
            money(row.balance, result.currencyCode),
            rowReviewStatus(result.validation, index),
            rowReviewNotes(result.validation, index),
            row.category,
          ].map((value) => new TableCell({ children: [new Paragraph(value)] })),
        }),
    ),
  ]

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: result.summary.title,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph(`Source file: ${result.fileName}`),
          ...(result.statementPeriod?.start || result.statementPeriod?.end
            ? [
                new Paragraph(
                  `Statement period: ${[result.statementPeriod.start, result.statementPeriod.end]
                    .filter(Boolean)
                    .join(' to ')}`,
                ),
              ]
            : []),
          new Paragraph(`Detected type: ${result.summary.documentKind}`),
          new Paragraph(`Confidence: ${result.confidence}%`),
          new Paragraph(`Validation: ${validationLabel(result.validation.status)}`),
          ...result.validation.issues.slice(0, 6).map((issue) => new Paragraph(issue.message)),
          new Paragraph(''),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
        ],
      },
    ],
  })

  return Packer.toBlob(document)
}

export function createPdfBlob(result: ConversionResult) {
  return createPdfBlobAsync(result)
}

export function createReviewJsonBlob(result: ConversionResult) {
  const payload = {
    schema: 'extractmint.review.v2',
    createdAt: new Date().toISOString(),
    fileName: result.fileName,
    fileType: result.fileType,
    currencyCode: result.currencyCode,
    ...(result.summary.documentKind === 'Receipt'
      ? { currencyCodeDetected: result.currencyCodeDetected ?? false }
      : {}),
    statementPeriod: result.statementPeriod,
    fileMeta: result.fileMeta,
    processedAt: result.processedAt,
    confidence: result.confidence,
    summary: result.summary,
    rows: result.rows,
    rowCount: result.rows.length,
    totals: {
      amount: result.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
      withdrawal: result.rows.reduce((sum, row) => sum + (row.withdrawal ?? 0), 0),
      deposit: result.rows.reduce((sum, row) => sum + (row.deposit ?? 0), 0),
      balanceCount: result.rows.reduce((sum, row) => sum + (row.balance !== undefined ? 1 : 0), 0),
    },
    validation: result.validation,
  }

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
}

export type PrivacySafeDiagnostic = {
  schema: 'extractmint.diagnostic.v1'
  createdAt: string
  file: {
    fileType: string
    fileExtension: string
    size: number
    lastModified: number
    sha256?: string
  }
  extraction: {
    pagesDetected: number
    totalChars: number
    nonWhitespaceChars: number
    avgNonWhitespaceCharsPerPage: number
    lineCount: number
    tabLineCount: number
    moneyTokenCount: number
    dateTokenCount: number
    keywordsPresent: string[]
  }
  parsing: {
    documentKind: string
    currencyCode: string
    statementPeriod?: ConversionResult['statementPeriod']
    rowCount: number
    hasAmount: boolean
    hasDeposit: boolean
    hasWithdrawal: boolean
    hasBalance: boolean
    validation: Pick<ValidationSummary, 'status' | 'checkedRows' | 'issueCount'>
  }
}

function extensionOfFileName(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ''
}

function countMatches(haystack: string, pattern: RegExp) {
  const global = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
  let count = 0
  for (;;) {
    const match = global.exec(haystack)
    if (!match) break
    count += 1
  }
  return count
}

function detectedPagesFromRawText(rawText: string) {
  const matches = rawText.match(/^Page\s+\d+\b/gm) ?? []
  return Math.max(1, matches.length)
}

function diagnosticKeywords(rawText: string) {
  const lower = rawText.toLowerCase()
  const keywords = [
    'balance',
    'opening balance',
    'closing balance',
    'withdrawal',
    'debit',
    'deposit',
    'credit',
    'transaction',
    'statement',
    'account',
    'reference',
    'description',
    'date',
    'amount',
    'total fees',
    'fee',
    'tax',
  ]
  return keywords.filter((keyword) => lower.includes(keyword))
}

export function createPrivacySafeDiagnostic(result: ConversionResult): PrivacySafeDiagnostic {
  const rawText = result.rawText || ''
  const pagesDetected = detectedPagesFromRawText(rawText)
  const totalChars = rawText.length
  const nonWhitespaceChars = rawText.replace(/\s+/g, '').length
  const lineCount = rawText ? rawText.split(/\r?\n/).length : 0
  const tabLineCount = rawText ? rawText.split(/\r?\n/).filter((line) => line.includes('\t')).length : 0
  const moneyTokenCount = countMatches(rawText, amountPattern)
  const dateTokenCount = countMatches(rawText, datePattern)
  const avgNonWhitespaceCharsPerPage = Math.round(nonWhitespaceChars / Math.max(1, pagesDetected))

  const hasAmount = result.rows.some((row) => typeof row.amount === 'number')
  const hasDeposit = result.rows.some((row) => typeof row.deposit === 'number')
  const hasWithdrawal = result.rows.some((row) => typeof row.withdrawal === 'number')
  const hasBalance = result.rows.some((row) => typeof row.balance === 'number')

  return {
    schema: 'extractmint.diagnostic.v1',
    createdAt: new Date().toISOString(),
    file: {
      fileType: result.fileType,
      fileExtension: extensionOfFileName(result.fileName),
      size: result.fileMeta.size,
      lastModified: result.fileMeta.lastModified,
      sha256: result.fileMeta.sha256,
    },
    extraction: {
      pagesDetected,
      totalChars,
      nonWhitespaceChars,
      avgNonWhitespaceCharsPerPage,
      lineCount,
      tabLineCount,
      moneyTokenCount,
      dateTokenCount,
      keywordsPresent: diagnosticKeywords(rawText),
    },
    parsing: {
      documentKind: result.summary.documentKind,
      currencyCode: result.currencyCode,
      statementPeriod: result.statementPeriod,
      rowCount: result.rows.length,
      hasAmount,
      hasDeposit,
      hasWithdrawal,
      hasBalance,
      validation: {
        status: result.validation.status,
        checkedRows: result.validation.checkedRows,
        issueCount: result.validation.issueCount,
      },
    },
  }
}

export function createPrivacySafeDiagnosticBlob(result: ConversionResult) {
  const payload = createPrivacySafeDiagnostic(result)
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
}

const asFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const asString = (value: unknown) =>
  typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value)

export async function importReviewJson(file: File): Promise<ConversionResult> {
  const text = await file.text()
  const payload = JSON.parse(text) as Record<string, unknown>

  const schema = asString(payload.schema)
  if (!schema || !schema.startsWith('extractmint.review.')) {
    throw new Error('Not an ExtractMint review JSON export')
  }

  const rowsValue = payload.rows
  if (!Array.isArray(rowsValue)) {
    throw new Error(
      'This review JSON does not include rows. Re-export a new review JSON (schema extractmint.review.v2).',
    )
  }

  const fileName = asString(payload.fileName) ?? file.name
  const fileType = asString(payload.fileType) ?? 'application/json'
  const currencyCode = asString(payload.currencyCode) ?? 'USD'
  const currencyCodeDetected = typeof payload.currencyCodeDetected === 'boolean'
    ? payload.currencyCodeDetected
    : undefined
  const processedAt = asString(payload.processedAt) ?? asString(payload.createdAt) ?? new Date().toISOString()

  const summary =
    typeof payload.summary === 'object' && payload.summary
      ? (payload.summary as ConversionResult['summary'])
      : {
          title: fileName.replace(/\.[^.]+$/, '') || fileName,
          documentKind: 'Review import',
          total: rowsValue.length,
          notes: ['Imported from ExtractMint review JSON'],
        }

  const fileMeta =
    typeof payload.fileMeta === 'object' && payload.fileMeta
      ? (payload.fileMeta as ConversionResult['fileMeta'])
      : {
          size: file.size,
          lastModified: file.lastModified,
        }

  const rows: ExtractedRow[] = rowsValue.map((row) => {
    const record = (row ?? {}) as Record<string, unknown>
    const description = asString(record.description)?.trim() || 'Transaction'
    const category = asString(record.category)?.trim() || 'Uncategorized'
    const confidence = asFiniteNumber(record.confidence) ?? 0
    const source = asString(record.source)?.trim() || 'review-json'

    const amount = asFiniteNumber(record.amount)
    const withdrawal = asFiniteNumber(record.withdrawal)
    const deposit = asFiniteNumber(record.deposit)
    const tax = asFiniteNumber(record.tax)
    const balance = asFiniteNumber(record.balance)

    return {
      date: asString(record.date)?.trim() || undefined,
      description,
      amount,
      withdrawal,
      deposit,
      tax,
      balance,
      reference: asString(record.reference)?.trim() || undefined,
      category,
      confidence,
      source,
    }
  })

  const validation = revalidateRows(rows, currencyCode)
  const statementPeriod =
    typeof payload.statementPeriod === 'object' && payload.statementPeriod
      ? refreshStatementPeriod(rows, payload.statementPeriod as ConversionResult['statementPeriod'])
      : refreshStatementPeriod(rows)

  return {
    fileName,
    fileType,
    currencyCode,
    currencyCodeDetected,
    statementPeriod,
    fileMeta,
    rawText: '',
    rows,
    confidence: asFiniteNumber(payload.confidence) ?? Math.round((summary.total ?? 0) > 0 ? 84 : 0),
    validation,
    processedAt,
    summary,
  }
}

export async function importReviewPackZip(file: File): Promise<ReviewPackImport> {
  const JSZip = (await import('jszip')).default
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  const results: ConversionResult[] = []
  const sourcesBySha: Record<string, ReviewPackSource> = {}

  const entries = Object.keys(zip.files)
    .map((name) => zip.files[name])
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.extractmint-review.json'))

  if (entries.length === 0) {
    throw new Error('No .extractmint-review.json files found in this ZIP')
  }

  for (const entry of entries) {
    const json = await entry.async('string')
    const importedFile = new File([json], entry.name.split('/').pop() || entry.name, {
      type: 'application/json;charset=utf-8',
      lastModified: file.lastModified || Date.now(),
    })
    results.push(await importReviewJson(importedFile))
  }

  const manifestEntry = Object.keys(zip.files)
    .map((name) => zip.files[name])
    .find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('sources/manifest.json'))

  if (manifestEntry) {
    try {
      const json = await manifestEntry.async('string')
      const parsed = JSON.parse(json) as unknown
      const list = Array.isArray(parsed) ? parsed : []
      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const sha256 = asString(record.sha256)
        const path = asString(record.path)
        const fileName = asString(record.fileName)
        const mimeType = asString(record.mimeType)
        if (!sha256 || !path) continue
        const entry = zip.file(path)
        if (!entry) continue
        const blob = await entry.async('blob')
        sourcesBySha[sha256] = {
          blob,
          fileName: fileName || path.split('/').pop() || sha256,
          mimeType: mimeType || 'application/octet-stream',
        }
      }
    } catch {
      // ignore manifest parse failures
    }
  }

  return { results, sourcesBySha }
}

function sanitizeZipName(value: string) {
  const normalized = (value ?? '')
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\w.\- ()]+/g, '')
    .trim()
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized || 'file'
}

export async function createReviewPackZipBlob(results: ConversionResult[], sourcesBySha?: Record<string, ReviewPackSource>) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const root = zip.folder('extractmint-review-pack') ?? zip
  const sourcesFolder = root.folder('sources') ?? root

  for (const result of results) {
    const baseName = result.fileName.replace(/\.[^.]+$/, '') || 'extractmint'
    const xlsx = await createExcelBlob(result)
    const json = createReviewJsonBlob(result)
    root.file(`${baseName}.xlsx`, xlsx)
    root.file(`${baseName}.extractmint-review.json`, json)
  }

  const manifest: Array<{ sha256: string; fileName: string; mimeType: string; size: number; path: string }> = []
  const entries = sourcesBySha ? Object.entries(sourcesBySha) : []
  for (const [sha256, source] of entries) {
    if (!sha256 || !source?.blob) continue
    const safeName = sanitizeZipName(source.fileName || `${sha256}`)
    const path = `sources/${sha256}-${safeName}`
    sourcesFolder.file(`${sha256}-${safeName}`, source.blob)
    manifest.push({
      sha256,
      fileName: source.fileName,
      mimeType: source.mimeType,
      size: source.blob.size,
      path: `extractmint-review-pack/${path}`,
    })
  }
  if (manifest.length > 0) {
    sourcesFolder.file('manifest.json', JSON.stringify(manifest, null, 2))
  }

  return zip.generateAsync({ type: 'blob' })
}

async function createPdfBlobAsync(result: ConversionResult) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 44
  let y = margin

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text(result.summary.title, margin, y)
  y += 30

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Source: ${result.fileName}`, margin, y)
  y += 16
  if (result.statementPeriod?.start || result.statementPeriod?.end) {
    pdf.text(
      `Statement period: ${[result.statementPeriod.start, result.statementPeriod.end]
        .filter(Boolean)
        .join(' to ')}`,
      margin,
      y,
    )
    y += 16
  }
  pdf.text(`Detected type: ${result.summary.documentKind}`, margin, y)
  y += 16
  pdf.text(`Confidence: ${result.confidence}%`, margin, y)
  y += 16
  pdf.text(`Validation: ${validationLabel(result.validation.status)}`, margin, y)
  y += 28

  pdf.setFont('helvetica', 'bold')
  pdf.text('Date', margin, y)
  pdf.text('Description', margin + 82, y)
  pdf.text('Withdrawal', margin + 310, y)
  pdf.text('Deposit', margin + 390, y)
  pdf.text('Balance', margin + 470, y)
  y += 12
  pdf.line(margin, y, 552, y)
  y += 18

  pdf.setFont('helvetica', 'normal')
  result.rows.slice(0, 28).forEach((row, index) => {
    if (y > 742) {
      pdf.addPage()
      y = margin
    }
    pdf.text(row.date ?? '-', margin, y)
    pdf.text(pdf.splitTextToSize(row.description, 210), margin + 82, y)
    pdf.text(money(row.withdrawal, result.currencyCode), margin + 310, y)
    pdf.text(money(row.deposit, result.currencyCode), margin + 390, y)
    pdf.text(money(row.balance, result.currencyCode), margin + 470, y)
    const note = rowReviewNotes(result.validation, index)
    if (note) {
      y += 12
      pdf.setTextColor(146, 84, 0)
      pdf.text(pdf.splitTextToSize(`Review: ${note}`, 420), margin + 82, y)
      pdf.setTextColor(0, 0, 0)
    }
    y += 24
  })

  return pdf.output('blob')
}

const ocrTextCache = new Map<string, string>()

export function clearInMemoryOcrCache() {
  ocrTextCache.clear()
}

function fileSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function normalizeOcrLanguage(language?: string) {
  const value = (language ?? 'eng').trim()
  return value || 'eng'
}

async function extractText(file: File, onProgress: ProgressCallback, options: ExtractionOptions) {
  const extension = extensionOf(file.name)

  if (file.type === 'application/pdf' || extension === 'pdf') {
    return extractPdfText(file, onProgress, options)
  }

  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff'].includes(extension)) {
    return extractImageText(file, onProgress, options)
  }

  if (extension === 'docx') {
    return extractDocxText(file)
  }

  if (['xlsx', 'xls'].includes(extension)) {
    return extractWorkbookText(file)
  }

  return file.text()
}

async function extractPdfText(file: File, onProgress: ProgressCallback, options: ExtractionOptions) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const buffer = await file.arrayBuffer()
  if (options.signal?.aborted) {
    throw new DOMException('Conversion canceled', 'AbortError')
  }
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const requestPdfPassword = options.requestPdfPassword
  const detachPasswordPrompt = requestPdfPassword
    ? attachPdfPasswordPrompt(
        loadingTask,
        (reason) => requestPdfPassword(file.name, reason, options.signal),
        pdfjs.PasswordResponses,
      )
    : undefined
  let pdf: PDFDocumentProxy
  try {
    pdf = await loadingTask.promise
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('Conversion canceled', 'AbortError')
    }
    throw error
  } finally {
    detachPasswordPrompt?.()
  }
  options.onPdfDocumentLoaded?.(file, pdf)
  const chunks: string[] = []
  const signature = fileSignature(file)
  const ocrLanguage = normalizeOcrLanguage(options.ocrLanguage)

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = formatPdfTextItems(content.items)
    chunks.push(`Page ${pageNumber}\n${text}`)
    onProgress({
      fileName: file.name,
      stage: 'reading',
      percent: Math.round((pageNumber / pdf.numPages) * 72),
      detail: `Read page ${pageNumber} of ${pdf.numPages}`,
    })
  }

  const extracted = chunks.join('\n')
  const extractedDensity = extracted.replace(/\s+/g, '').length / Math.max(pdf.numPages, 1)

  if (!options.forceOcr && extractedDensity >= 220) return extracted

  onProgress({
    fileName: file.name,
    stage: 'ocr',
    percent: 2,
    detail: 'Low text detected — running OCR on PDF pages',
  })

  const ocrChunks: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const text = await extractPdfPageWithOcr(
      pdf,
      pageNumber,
      file.name,
      signature,
      ocrLanguage,
      options.persistOcrCache === true,
      onProgress,
    )
    ocrChunks.push(`Page ${pageNumber}\n${text}`)
  }

  return ocrChunks.join('\n')
}

type PdfDocumentLike = { getPage: (pageNumber: number) => Promise<unknown>; numPages: number }

async function extractPdfPageWithOcr(
  pdf: PdfDocumentLike,
  pageNumber: number,
  fileName: string,
  signature: string,
  ocrLanguage: string,
  persistOcrCache: boolean,
  onProgress: ProgressCallback,
) {
  const cacheKey = `pdf:${signature}:${ocrLanguage}:${pageNumber}`
  const cached = ocrTextCache.get(cacheKey)
  if (cached !== undefined) return cached
  if (persistOcrCache) {
    const persistent = await getPersistentOcrText(cacheKey)
    if (persistent !== undefined) {
      ocrTextCache.set(cacheKey, persistent)
      return persistent
    }
  }

  const page = await pdf.getPage(pageNumber)
  if (!page || typeof page !== 'object') return ''
  if (!('getViewport' in page) || !('render' in page)) return ''
  if (typeof (page as { getViewport?: unknown }).getViewport !== 'function') return ''
  if (typeof (page as { render?: unknown }).render !== 'function') return ''

  const viewport = (page as { getViewport: (options: { scale: number }) => unknown }).getViewport({ scale: 2 })
  const viewportSize = viewport as { width?: unknown; height?: unknown }
  const canvas = document.createElement('canvas')
  const width = Number(viewportSize.width ?? 0)
  const height = Number(viewportSize.height ?? 0)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return ''
  }
  canvas.width = Math.ceil(width)
  canvas.height = Math.ceil(height)
  const context = canvas.getContext('2d')
  if (!context) return ''

  const renderTask = (
    page as {
      render: (options: {
        canvasContext: CanvasRenderingContext2D
        viewport: unknown
        canvas: HTMLCanvasElement
      }) => { promise?: unknown }
    }
  ).render({ canvasContext: context, viewport, canvas })
  const promise = renderTask && typeof renderTask === 'object' && 'promise' in renderTask ? (renderTask as { promise: unknown }).promise : undefined
  if (!(promise instanceof Promise)) return ''
  await promise

  const { recognize } = await import('tesseract.js')
  const result = await recognize(canvas, ocrLanguage, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        const pageBase = (pageNumber - 1) / Math.max(pdf.numPages, 1)
        const pageProgress = (message.progress ?? 0) / Math.max(pdf.numPages, 1)
        const percent = Math.round((pageBase + pageProgress) * 96)
        onProgress({
          fileName,
          stage: 'ocr',
          percent,
          detail: `OCR page ${pageNumber} of ${pdf.numPages}`,
        })
      }
    },
  })

  const text = result.data.text
  ocrTextCache.set(cacheKey, text)
  if (persistOcrCache) void setPersistentOcrText(cacheKey, text)
  return text
}

async function extractImageText(file: File, onProgress: ProgressCallback, options: ExtractionOptions) {
  const signature = fileSignature(file)
  const ocrLanguage = normalizeOcrLanguage(options.ocrLanguage)
  const cacheKey = `img:${signature}:${ocrLanguage}`
  const cached = ocrTextCache.get(cacheKey)
  if (cached !== undefined) return cached
  if (options.persistOcrCache === true) {
    const persistent = await getPersistentOcrText(cacheKey)
    if (persistent !== undefined) {
      ocrTextCache.set(cacheKey, persistent)
      return persistent
    }
  }

  const { recognize } = await import('tesseract.js')
  const result = await recognize(file, ocrLanguage, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress({
          fileName: file.name,
          stage: 'ocr',
          percent: Math.round((message.progress ?? 0) * 90),
          detail: 'Running receipt OCR',
        })
      }
    },
  })

  const text = result.data.text
  ocrTextCache.set(cacheKey, text)
  if (options.persistOcrCache === true) void setPersistentOcrText(cacheKey, text)
  return text
}

async function extractDocxText(file: File) {
  const mammoth = await import('mammoth/mammoth.browser')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function extractWorkbookText(file: File) {
  const ExcelJS = await import('exceljs')
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const chunks: string[] = []
  workbook.worksheets.forEach((sheet) => {
    chunks.push(`Sheet ${sheet.name}`)
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      chunks.push(values.map(cellToText).join(' '))
    })
  })
  return chunks.join('\n')
}

type PositionedText = {
  str: string
  x: number
  y: number
  width: number
}

function formatPdfTextItems(items: unknown[]) {
  const positioned = items
    .map(toPositionedText)
    .filter((item): item is PositionedText => Boolean(item && item.str.trim()))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PositionedText[][] = []

  positioned.forEach((item) => {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2.6)
    if (line) {
      line.push(item)
    } else {
      lines.push([item])
    }
  })

  return lines
    .sort((a, b) => b[0].y - a[0].y)
    .map((line) => formatPdfLine(line.sort((a, b) => a.x - b.x)))
    .filter(Boolean)
    .join('\n')
}

function toPositionedText(item: unknown): PositionedText | undefined {
  if (!item || typeof item !== 'object') return undefined
  if (!('str' in item) || !('transform' in item)) return undefined

  const source = item as { str: unknown; transform: unknown; width?: unknown }
  if (typeof source.str !== 'string') return undefined
  if (!Array.isArray(source.transform) || source.transform.length < 6) return undefined

  const x = Number(source.transform[4])
  const y = Number(source.transform[5])
  const width = Number(source.width ?? 0)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined

  return { str: source.str.trim(), x, y, width: Number.isFinite(width) ? width : 0 }
}

function formatPdfLine(line: PositionedText[]) {
  const columns = ['', '', '', '', '', '', '']

  line.forEach((item) => {
    const columnIndex = columnForX(item.x)
    columns[columnIndex] = [columns[columnIndex], item.str].filter(Boolean).join(' ')
  })

  const hasTableShape = columns.slice(2).some(Boolean) || (columns[0] && columns[1])
  if (hasTableShape) {
    return trimTrailingEmptyColumns(columns).join('\t')
  }

  if (columns[1] && !columns[0]) {
    return `\t${columns[1]}`
  }

  return line.map((item) => item.str).join(' ')
}

function columnForX(x: number) {
  if (x < 65) return 0
  if (x < 240) return 1
  if (x < 315) return 2
  if (x < 390) return 3
  if (x < 465) return 4
  if (x < 500) return 5
  return 6
}

function trimTrailingEmptyColumns(columns: string[]) {
  const next = [...columns]
  while (next.length > 1 && !next.at(-1)) next.pop()
  return next
}

function parseRawText(
  rawText: string,
  fileName: string,
  fileType: string,
  fileMeta: ConversionResult['fileMeta'],
): ConversionResult {
  const normalized = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/^ +| +$/g, ''))
    .filter((line) => line.replace(/\t/g, '').trim())

  const structuredRows = parseStatementTable(lines)
  const currency = detectCurrencyCode(normalized, fileName)
  const receipt = structuredRows.length === 0 && looksLikeReceipt(lines, fileName)
  const rows = structuredRows.length > 0
    ? structuredRows
    : receipt
      ? [parseReceipt(lines, fileName, currency.code, currency.detected)]
      : lines.flatMap((line, index) => parseLine(line, index + 1))
  const fallbackRows = rows.length > 0 ? rows : buildFallbackRows(lines)
  const statementPeriod = receipt ? undefined : detectStatementPeriod(lines, fallbackRows)
  const currencyCode = currency.code
  const validation = receipt
    ? { status: 'missing' as const, checkedRows: 0, issueCount: 0, issues: [] }
    : validateBalances(fallbackRows, currencyCode)
  const summary = receipt
    ? {
        title: fileName.replace(/\.[^.]+$/, '') || fileName,
        documentKind: 'Receipt',
        total: fallbackRows[0]?.amount,
        vendor: fallbackRows[0]?.description === 'Receipt' ? undefined : fallbackRows[0]?.description,
        notes: fallbackRows[0]?.amount === undefined ? ['Receipt total not found; review required'] : [],
      }
    : summarize(lines, fallbackRows, fileName, validation)
  const confidence = receipt
    ? fallbackRows[0]?.confidence ?? 0
    : scoreConfidence(fileType, fallbackRows, normalized, validation)

  return {
    fileName,
    fileType,
    currencyCode,
    currencyCodeDetected: currency.detected,
    statementPeriod,
    fileMeta,
    rawText: normalized,
    rows: fallbackRows,
    confidence,
    validation,
    processedAt: new Date().toISOString(),
    summary,
  }
}

async function sha256Hex(file: File) {
  if (!globalThis.crypto?.subtle) return undefined
  const buffer = await file.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseLine(line: string, lineNumber: number): ExtractedRow[] {
  const flatLine = line.replace(/\t/g, ' ')
  const date = flatLine.match(datePattern)?.[0]
  const amountMatches = flatLine.match(amountPattern) ?? []
  const parsedAmounts = amountMatches.map(parseAmount).filter(isFinite)

  if (!date && !looksLikeReceiptTotal(flatLine)) return []
  if (parsedAmounts.length === 0) return []

  const amount = parsedAmounts.length > 1 ? parsedAmounts.at(-2) : parsedAmounts.at(-1)
  const balance = parsedAmounts.length > 1 ? parsedAmounts.at(-1) : undefined
  const description = cleanDescription(flatLine, date, amountMatches)

  return [
    {
      date,
      description: description || line.slice(0, 90),
      amount,
      balance,
      category: classifyLine(flatLine),
      confidence: date ? 92 : 78,
      source: `Line ${lineNumber}`,
    },
  ]
}

function parseStatementTable(lines: string[]): ExtractedRow[] {
  const hasStatementColumns = lines.some(
    (line) =>
      line.includes('\t') &&
      /Withdrawal|Pengeluaran|Deposits|Deposit|Balance|Baki/i.test(line),
  )
  if (!hasStatementColumns) return []

  const rows: ExtractedRow[] = []
  let current: (ExtractedRow & { descriptionParts: string[] }) | undefined
  let sourceLine = 0

  const finishCurrent = () => {
    if (!current) return
    const { descriptionParts, ...row } = current
    row.description = compactDescription(descriptionParts)
    rows.push(row)
    current = undefined
  }

  for (const line of lines) {
    sourceLine += 1
    const columns = splitStatementColumns(line)
    const [dateColumn, descriptionColumn, referenceColumn, withdrawalColumn, depositColumn, taxColumn, balanceColumn] =
      columns
    const candidateDate = dateColumn.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)?.[0]

    if (isStatementNoise(line)) continue

    if (/^OPENING BALANCE$/i.test(descriptionColumn) || /^CLOSING BALANCE/i.test(descriptionColumn)) {
      finishCurrent()
      const balance = parseMoneyCell(balanceColumn)
      rows.push({
        description: descriptionColumn,
        balance,
        category: 'Balance',
        confidence: 96,
        source: `Line ${sourceLine}`,
      })
      continue
    }

    if (candidateDate) {
      finishCurrent()
      const withdrawal = parseMoneyCell(withdrawalColumn)
      const deposit = parseMoneyCell(depositColumn)
      const tax = parseMoneyCell(taxColumn)
      const balance = parseMoneyCell(balanceColumn)
      const amount = deposit ?? (withdrawal !== undefined ? -withdrawal : undefined)
      const initialDescription = dateColumn.replace(candidateDate, '').trim()
      current = {
        date: candidateDate,
        description: initialDescription,
        descriptionParts: [initialDescription, descriptionColumn],
        reference: referenceColumn || undefined,
        withdrawal,
        deposit,
        tax,
        amount,
        balance,
        category: classifyStructuredRow(initialDescription, amount),
        confidence: balance !== undefined && (amount !== undefined || tax !== undefined) ? 98 : 84,
        source: `Line ${sourceLine}`,
      }
      continue
    }

    if (current) {
      if (descriptionColumn && !isStatementNoise(descriptionColumn)) {
        current.descriptionParts.push(descriptionColumn)
      }
      if (referenceColumn && !isStatementNoise(referenceColumn)) {
        current.reference = current.reference
          ? `${current.reference} ${referenceColumn}`.trim()
          : referenceColumn
      }
    }
  }

  finishCurrent()
  return rows
}

function splitStatementColumns(line: string) {
  const columns = line.split('\t').map((column) => column.trim())
  while (columns.length < 7) columns.push('')
  return columns.slice(0, 7)
}

function isStatementNoise(line: string) {
  const text = line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return true
  return (
    /^Page \/|^Halaman$|^Page \d+ of \d+$/i.test(text) ||
    /^Statement Date \/|^Tarikh Penyata$|^Should you have|^or call our CIMB/i.test(text) ||
    /^PREF\/S\b|^CIMB Bank Berhad|^Statement of Account$/i.test(text) ||
    /^Date Tarikh Description|^Date Tarikh$|^Date Description/i.test(text) ||
    /^Tarikh Diskripsi|^Description Diskripsi|^Ref No|^No\. Rujukan$/i.test(text) ||
    /^Withdrawal Pengeluaran|^Deposits Deposit|^Tax Cukai|^Balance Baki$/i.test(text) ||
    /^\(RM\)|^\d{10,}\s+\d+\s+17-SSSSSSS/i.test(text) ||
    /^17-SSSSSSS/i.test(text) ||
    /^(Important Notice|Notis Penting|Effective 8 November|The Bank must be informed)/i.test(text) ||
    /^(Summary of Your|Ringkasan|Points Earned|Mata Diperolehi|Points Redeemed|Mata Dilunaskan|Points Transferred|Mata Dipindahkan|Total Points Available|Jumlah Mata|Points Expiring|Mata Yang|Amount of Points Expiring)/i.test(
      text,
    ) ||
    /^(Savings Account Transaction Details|Butir-butir Transaksi|Account No|No Akaun|AIR ASIA SAVERS ACCOUNT|Protected by PIDM)/i.test(
      text,
    ) ||
    /^\*{3} End of Statement/i.test(text) ||
    /^Akhir Penyata/i.test(text)
  )
}

function compactDescription(parts: string[]) {
  const seen = new Set<string>()
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' ')
    .replace(/\s+([/#*-])/g, '$1')
    .slice(0, 260)
}

function parseMoneyCell(value: string) {
  const text = value.trim()
  if (!text) return undefined
  const match = text.match(amountPattern)?.at(-1)
  return match ? parseAmount(match) : undefined
}

const dateGlobalPattern = new RegExp(datePattern.source, 'gi')

function extractDatesFromLine(line: string) {
  const matches = Array.from(line.matchAll(dateGlobalPattern), (match) => match[0]).filter(Boolean)
  return Array.from(new Set(matches.map((value) => value.trim()))).slice(0, 6)
}

function parseDateToIso(input: string) {
  const value = input.trim()
  if (!value) return undefined

  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const year = iso[1]
    const month = Number(iso[2])
    const day = Number(iso[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const slash = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    const [month, day] = first > 12 ? [second, first] : [first, second]
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const monthName = value.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})$/i,
  )
  if (monthName) {
    const monthKey = monthName[1].slice(0, 3).toLowerCase()
    const day = Number(monthName[2])
    const year = monthName[3].length === 2 ? `20${monthName[3]}` : monthName[3]
    const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      monthKey,
    )
    if (monthIndex === -1 || day < 1 || day > 31) return undefined
    const month = monthIndex + 1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return undefined
}

function normalizeIsoRange(start?: string, end?: string) {
  if (!start && !end) return undefined
  if (start && end && start > end) return { start: end, end: start }
  return { start, end }
}

function detectStatementPeriod(lines: string[], rows: ExtractedRow[]): ConversionResult['statementPeriod'] | undefined {
  for (const line of lines) {
    const text = line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (!/(statement\s*(period|from|to)|period\s*(from|to)|for\s+the\s+period)/i.test(text)) continue

    const dates = extractDatesFromLine(text)
    if (dates.length < 2) continue
    const first = parseDateToIso(dates[0] ?? '')
    const second = parseDateToIso(dates[1] ?? '')
    const normalized = normalizeIsoRange(first, second)
    if (normalized?.start || normalized?.end) {
      return { ...normalized, source: 'explicit' }
    }
  }

  const inferred = inferStatementPeriodFromRows(rows)
  return inferred ? { ...inferred, source: 'inferred' } : undefined
}

function inferStatementPeriodFromRows(rows: ExtractedRow[]) {
  const parsed = rows
    .map((row) => parseDateToIso(row.date ?? ''))
    .filter((value): value is string => Boolean(value))
    .sort()
  if (parsed.length === 0) return undefined
  const start = parsed[0]
  const end = parsed[parsed.length - 1]
  return normalizeIsoRange(start, end)
}

function classifyStructuredRow(description: string, amount?: number) {
  const label = classifyLine(description)
  if (label !== 'Transaction') return label
  if (amount && amount > 0) return 'Deposit'
  if (amount && amount < 0) return 'Withdrawal'
  return label
}

function buildFallbackRows(lines: string[]): ExtractedRow[] {
  const usefulLines = lines
    .filter((line) => line.length > 6)
    .slice(0, 10)
    .map((line, index) => ({
      description: line,
      amount: line.match(amountPattern)?.map(parseAmount).filter(isFinite).at(-1),
      category: classifyLine(line),
      confidence: 54,
      source: `Line ${index + 1}`,
    }))

  return usefulLines.length > 0
    ? usefulLines
    : [
        {
          description: 'No extractable text found. Try a clearer scan or server OCR mode.',
          category: 'Review',
          confidence: 20,
          source: 'Document',
        },
      ]
}

function summarize(
  lines: string[],
  rows: ExtractedRow[],
  fileName: string,
  validation: ValidationSummary,
) {
  const firstMeaningful = lines.find((line) => /[a-z]/i.test(line)) ?? fileName
  const totalLine =
    lines.find((line) => /\b(total|ending balance|amount due|grand total|balance due)\b/i.test(line)) ??
    ''
  const total =
    totalLine.match(amountPattern)?.map(parseAmount).filter(isFinite).at(-1) ??
    rows.reduce((sum, row) => sum + Math.abs(row.amount ?? 0), 0)
  const lower = `${fileName} ${lines.slice(0, 15).join(' ')}`.toLowerCase()
  const documentKind = lower.includes('receipt')
    ? 'Receipt'
    : lower.includes('invoice')
      ? 'Invoice'
      : lower.includes('statement') || rows.some((row) => row.balance !== undefined)
        ? 'Statement'
        : 'Document'

  return {
    title: firstMeaningful.slice(0, 72),
    documentKind,
    total,
    vendor: firstMeaningful,
    notes: [
      `${rows.length} structured rows detected`,
      validation.status === 'valid'
        ? `${validation.checkedRows} balance transitions validated`
        : validation.status === 'review'
          ? `${validation.issueCount} balance issue${validation.issueCount === 1 ? '' : 's'} need review`
          : 'Balance trail could not be fully validated',
      totalLine ? `Total signal: ${totalLine.slice(0, 90)}` : 'No explicit total line found',
    ],
  }
}

function scoreConfidence(
  fileType: string,
  rows: ExtractedRow[],
  rawText: string,
  validation: ValidationSummary,
) {
  let score = 46
  if (fileType.includes('pdf') || fileType === 'pdf') score += 8
  if (rawText.length > 180) score += 12
  if (rows.length >= 3) score += 18
  if (rows.some((row) => row.date)) score += 10
  if (rows.some((row) => row.balance !== undefined)) score += 8
  if (validation.status === 'valid') score += 2
  if (validation.status === 'review') score -= Math.min(16, validation.issueCount * 4)
  return Math.max(20, Math.min(98, score))
}

function validateBalances(rows: ExtractedRow[], currencyCode: string): ValidationSummary {
  const issues: ValidationIssue[] = []
  const rowsWithBalances = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.balance !== undefined)
  const openingRow = rows.find((row) => /^OPENING BALANCE$/i.test(row.description))
  const closingRow = [...rows].reverse().find((row) => /^CLOSING BALANCE/i.test(row.description))
  let checkedRows = 0

  for (let position = 1; position < rowsWithBalances.length; position += 1) {
    const previous = rowsWithBalances[position - 1]
    const current = rowsWithBalances[position]
    const amount = amountForBalanceCheck(current.row)

    if (amount === undefined || previous.row.balance === undefined || current.row.balance === undefined) {
      if (current.row.date) {
        issues.push({
          severity: 'warning',
          rowIndex: current.index,
          message: 'Balance present but no debit/deposit amount was detected for this row.',
        })
      }
      continue
    }

    checkedRows += 1
    const expectedBalance = roundMoney(previous.row.balance + amount)
    const actualBalance = roundMoney(current.row.balance)
    const delta = roundMoney(actualBalance - expectedBalance)

    if (Math.abs(delta) > 0.01) {
      issues.push({
        severity: Math.abs(delta) > 1 ? 'error' : 'warning',
        rowIndex: current.index,
        expectedBalance,
        actualBalance,
        delta,
        message: `Expected balance ${money(expectedBalance, currencyCode)} after ${money(amount, currencyCode)}, but found ${money(actualBalance, currencyCode)}.`,
      })
    }
  }

  const transactionRowsWithBalance = rowsWithBalances.filter(({ row }) => row.date).length
  if (transactionRowsWithBalance > 1 && checkedRows === 0) {
    issues.push({
      severity: 'warning',
      message: 'Balance columns were detected, but there were not enough debit/deposit amounts to validate the trail.',
    })
  }

  const status: ValidationSummary['status'] =
    checkedRows === 0 ? 'missing' : issues.length > 0 ? 'review' : 'valid'

  return {
    status,
    checkedRows,
    issueCount: issues.length,
    openingBalance: openingRow?.balance ?? rowsWithBalances.at(0)?.row.balance,
    closingBalance: closingRow?.balance ?? rowsWithBalances.at(-1)?.row.balance,
    issues,
  }
}

function amountForBalanceCheck(row: ExtractedRow) {
  if (row.deposit !== undefined) return row.deposit
  if (row.withdrawal !== undefined) return -row.withdrawal
  return row.amount
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function validationLabel(status: ValidationSummary['status']) {
  if (status === 'valid') return 'Balance trail verified'
  if (status === 'review') return 'Needs review'
  return 'Not enough balance data'
}

function rowReviewIssues(validation: ValidationSummary, rowIndex: number) {
  return validation.issues.filter((issue) => issue.rowIndex === rowIndex)
}

function rowReviewStatus(validation: ValidationSummary, rowIndex: number) {
  const issues = rowReviewIssues(validation, rowIndex)
  if (issues.some((issue) => issue.severity === 'error')) return 'Review'
  if (issues.length > 0) return 'Check'
  if (validation.checkedRows > 0) return 'Verified'
  return 'Unvalidated'
}

function rowReviewNotes(validation: ValidationSummary, rowIndex: number) {
  return rowReviewIssues(validation, rowIndex)
    .map((issue) => issue.message)
    .join(' ')
}

function cleanDescription(line: string, date?: string, amountMatches: string[] = []) {
  let description = line
  if (date) description = description.replace(date, '')
  amountMatches.forEach((amount) => {
    description = description.replace(amount, '')
  })
  return description.replace(/\s{2,}/g, ' ').replace(/[-–—|]/g, ' ').trim()
}

function looksLikeReceiptTotal(line: string) {
  return /\b(total|subtotal|tax|amount due|balance due|paid)\b/i.test(line)
}

function classifyLine(line: string) {
  const lower = line.toLowerCase()
  if (/\b(total|balance|amount due|grand total)\b/.test(lower)) return 'Total'
  if (/\b(visa|mastercard|amex|card|pos|debit)\b/.test(lower)) return 'Card'
  if (/\b(payroll|salary|wages)\b/.test(lower)) return 'Payroll'
  if (/\b(stripe|paypal|payout|deposit|incoming|wire)\b/.test(lower)) return 'Income'
  if (/\b(fee|charge|subscription|aws|google|notion|software)\b/.test(lower)) return 'Expense'
  return 'Transaction'
}

function parseAmount(value: string) {
  const isNegative = value.includes('(') || value.trim().startsWith('-')
  const numeric = Number(value.replace(/[^\d.]/g, ''))
  return isNegative ? -numeric : numeric
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: unknown }).text)
  }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result)
  }
  return String(value)
}

function extensionOf(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function money(value?: number, currencyCode = 'USD') {
  if (value === undefined || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(value)
}

function detectCurrencyCode(rawText: string, fileName: string): { code: string; detected: boolean } {
  const combined = `${fileName}\n${rawText}`.toLowerCase()
  if (/\bmyr\b|\brm\b/.test(combined) || combined.includes('rm ')) return { code: 'MYR', detected: true }
  if (/\bsgd\b/.test(combined) || combined.includes('s$')) return { code: 'SGD', detected: true }
  if (/\beur\b|€/.test(combined)) return { code: 'EUR', detected: true }
  if (/\bgbp\b|£/.test(combined)) return { code: 'GBP', detected: true }
  if (/\bjpy\b|¥/.test(combined)) return { code: 'JPY', detected: true }
  if (/\baud\b/.test(combined) || combined.includes('a$')) return { code: 'AUD', detected: true }
  if (/\bcad\b/.test(combined) || combined.includes('c$')) return { code: 'CAD', detected: true }
  if (/\busd\b|\$/.test(combined)) return { code: 'USD', detected: true }
  return { code: 'USD', detected: false }
}

function looksLikeReceipt(lines: string[], fileName: string) {
  const text = `${fileName}\n${lines.join('\n')}`
  if (/\b(statement period|account number|opening balance|closing balance|running balance|transaction history)\b/i.test(text)) return false
  if (lines.some((line) => line.includes('\t') && /\b(date|description|withdrawal|deposit|balance)\b/i.test(line))) return false
  const runningBalancePattern = lines.some((line) => datePattern.test(line) && (line.match(amountPattern)?.length ?? 0) >= 2 && /\b(balance|debit|credit|withdrawal|deposit)\b/i.test(line))
  if (runningBalancePattern) return false
  return /\b(subtotal|tax|vat|gst|sst|total\s+paid|amount\s+paid|grand\s+total|merchant|pos|receipt|amount\s+due)\b/i.test(text)
}

function parseReceipt(lines: string[], fileName: string, _currencyCode: string, currencyCodeDetected: boolean): ExtractedRow {
  const normalizeLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  const dateLine = lines.find((line) => datePattern.test(line))
  const date = dateLine?.match(datePattern)?.[0]
  const labeledMerchantLine = lines.find((line) => /^\s*merchant\s*[:#-]\s*\S/i.test(line))
  const merchantLine = labeledMerchantLine ?? lines.find((line) => {
    const stripped = line.replace(datePattern, '').replace(amountPattern, '').trim()
    if (/^\s*(?:date|time|payment)\s*$/i.test(line)) return false
    const metadataLine = /^\s*(?:date|time|invoice(?:\s*(?:no|number|#))?|receipt(?:\s*(?:no|number|#))?|(?:tax|vat|gst|sst)\s*(?:id|identification|number|no\.?|registration(?:\s+(?:id|number|no\.?))?)|(?:company\s+)?registration\s*(?:id|no\.?|number|#)?|taxpayer\s*(?:id|number)|tin|cashier|operator|terminal|pos|register|payment(?:\s+method)?|(?:credit|debit)?\s*card(?:\s+(?:number|no))?|cash|transaction\s*(?:id|no|number)|authorization\s*code|approval\s*code|reference\s*(?:no|number|#)?|phone|tel|email|address)(?!\w)\s*(?:[:#.-]\s*)?\S/i
    return stripped.length > 1 && stripped.length <= 80 && !metadataLine.test(line) && !/\b(receipt|invoice|subtotal|tax|vat|gst|sst|total|amount paid|amount due|thank you|change|cashier|merchant|pos)\b/i.test(stripped)
  })
  const merchant = merchantLine?.replace(/^\s*merchant\s*[:#-]\s*/i, '').replace(datePattern, '').replace(amountPattern, '').trim()
  const taxQualifier = /\b(?:before|excluding|excl|pre)\s+(?:the\s+)?(?:tax|vat|gst|sst)\b|\b(?:tax|vat|gst|sst)\s+(?:excluded|excluding|excl|pre|before)\b/
  const inclusiveTaxQualifier = /\b(?:incl(?:uding)?|inclusive(?:\s+of)?|with)\s+(?:the\s+)?(?:tax|vat|gst|sst)\b|\b(?:tax|vat|gst|sst)\s+(?:included|inclusive(?:\s+of)?)\b/i
  const excludedTotalLabel = /\b(?:sub total|tax total|total tax|(?:vat|gst|sst) total|total (?:vat|gst|sst)|total (?:pre tax|before tax|excluding tax|savings?|discounts?|discounted|items?|quantity|units?)|(?:pre tax|before tax|excluding tax) total|(?:savings?|discounts?) total|taxable amount)\b/
  const totalLines = lines.filter((line) => {
    const label = normalizeLabel(line)
    const nonPayableQualifier = taxQualifier.test(label) || /\b(?:savings?|discounts?)\b/.test(label)
    return /\b(grand total|total paid|amount paid|amount due|balance due|total)\b/.test(label)
      && !excludedTotalLabel.test(label)
      && !nonPayableQualifier
  })
  const payablePriority = [/\bbalance\s+due\b/i, /\bgrand\s+total\b/i, /\bamount\s+due\b/i, /\btotal\s+paid\b/i, /\bamount\s+paid\b/i, /\btotal\b/i]
  const selectedPayableLabel = payablePriority.find((label) => totalLines.some((line) => label.test(line)))
  const totalLine = (selectedPayableLabel ? totalLines.find((line) => selectedPayableLabel.test(line)) : undefined) ?? totalLines[0]
  const totalAmountMatches = totalLine ? [...totalLine.matchAll(new RegExp(amountPattern.source, amountPattern.flags))] : []
  const eligibleTotalMatches = totalAmountMatches.filter((match) => {
    const suffix = totalLine?.slice((match.index ?? 0) + match[0].length) ?? ''
    return !/^\s*(?:\)?\s*%|%\s*\)?)/.test(suffix)
  })
  const inlineTaxAnnotationAmount = (match: RegExpMatchArray) => {
    const matchIndex = match.index ?? 0
    const before = totalLine?.slice(0, matchIndex) ?? ''
    const openParen = before.lastIndexOf('(')
    const closeParen = before.lastIndexOf(')')
    const isParenthesized = openParen > closeParen
    const annotationPrefix = isParenthesized ? before.slice(openParen + 1) : before
    if (!inclusiveTaxQualifier.test(annotationPrefix)
      || !/\b(?:tax|vat|gst|sst)\b/i.test(annotationPrefix)) return false
    if (isParenthesized) {
      const prefixWithoutRates = annotationPrefix.replace(/\b\d+(?:[.,]\d+)?\s*%\s*/g, '')
      return !/[\d$€£]/.test(prefixWithoutRates)
    }

    const qualifier = inclusiveTaxQualifier.exec(annotationPrefix)
    if (!qualifier) return false
    const qualifierEnd = qualifier.index + qualifier[0].length
    const beforeQualifier = annotationPrefix.slice(0, qualifier.index)
    const hasPayableAmountBeforeQualifier = eligibleTotalMatches.some((candidate) => {
      const candidateEnd = (candidate.index ?? 0) + candidate[0].length
      return candidateEnd <= beforeQualifier.length
    })
    const afterQualifier = annotationPrefix.slice(qualifierEnd).replace(/\b\d+(?:[.,]\d+)?\s*%\s*/g, '')
    return hasPayableAmountBeforeQualifier && !/[\d$€£]/.test(afterQualifier)
  }
  const payableLabelMatch = totalLine?.match(selectedPayableLabel ?? /\b(?:balance\s+due|grand\s+total|amount\s+due|total\s+paid|amount\s+paid|total)\b/i)
  const payableLabelEnd = payableLabelMatch ? (payableLabelMatch.index ?? 0) + payableLabelMatch[0].length : 0
  const inlineTaxAmount = (match: RegExpMatchArray) => {
    const matchIndex = match.index ?? 0
    const prefix = totalLine?.slice(payableLabelEnd, matchIndex) ?? ''
    const hasLaterAmount = eligibleTotalMatches.some((candidate) => (candidate.index ?? 0) > matchIndex)
    return hasLaterAmount && inclusiveTaxQualifier.test(prefix.toLowerCase())
      && /\b(?:tax|vat|gst|sst)\b/i.test(prefix)
  }
  const payableCandidates = eligibleTotalMatches.filter((match) => !inlineTaxAmount(match) && !inlineTaxAnnotationAmount(match))
  const labelIndex = payableLabelMatch?.index ?? 0
  const totalMatch = payableCandidates.sort((a, b) => {
    const distance = (match: RegExpMatchArray) => {
      const start = match.index ?? 0
      const end = start + match[0].length
      return end < labelIndex ? labelIndex - end : start > payableLabelEnd ? start - payableLabelEnd : 0
    }
    return distance(a) - distance(b)
  })[0]
  const taxMetadataLabel = /\b(?:tax|vat|gst|sst)\b.{0,30}\b(?:id|identification|number|no|registration|registered)\b|\b(?:id|identification|number|registration|registered)\b.{0,30}\b(?:tax|vat|gst|sst)\b/i
  const nonTaxAmountLabel = /\b(?:sub total|total (?:pre tax|before tax|excluding tax|including tax|incl tax|with tax|inclusive of tax|included in tax)|(?:tax|vat|gst|sst) (?:included|inclusive)|(?:before|excluding) tax total|pre tax total|taxable amount|(?:tax|vat|gst|sst) rate|rate (?:of )?(?:tax|vat|gst|sst))\b/i
  const taxLabel = /\b(?:total\s+(?:tax|vat|gst|sst)|tax\s+total|(?:vat|gst|sst)\s+(?:amount|total)|(?:tax|vat|gst|sst)\s*(?:amount|:|#|-)|tax\s+[$€£]|(?:vat|gst|sst)\s+[$€£]|\b(?:vat|gst|sst)\b|\btax\b)/i
  const taxLines = lines.filter((line) => taxLabel.test(line) && !/\b(sub[\s-]*total|tax invoice)\b/i.test(line) && !nonTaxAmountLabel.test(normalizeLabel(line)) && !taxQualifier.test(normalizeLabel(line)) && !inclusiveTaxQualifier.test(normalizeLabel(line)) && !taxMetadataLabel.test(line) && !/\b(?:company\s+)?registration\b/i.test(line) && !/^\s*(?:taxpayer\s*(?:id|number)|tin)\s*(?:[:#-]\s*)?\S/i.test(line) && !(/\btotal\b/i.test(line) && /\b(?:savings?|discounts?|before tax|excluding tax|pre tax)\b/i.test(normalizeLabel(line))))
  const monetaryTaxLines = taxLines.filter((line) => {
    const amountMatches = [...line.matchAll(new RegExp(amountPattern.source, amountPattern.flags))]
    return amountMatches.some((match) => {
      const suffix = line.slice((match.index ?? 0) + match[0].length)
      return !/^\s*(?:\)?\s*%|%\s*\)?)/.test(suffix)
    })
  })
  const taxLine = monetaryTaxLines[0]
  const taxAmountMatches = taxLine ? [...taxLine.matchAll(new RegExp(amountPattern.source, amountPattern.flags))] : []
  const taxMatch = taxAmountMatches.filter((match) => {
    const suffix = taxLine?.slice((match.index ?? 0) + match[0].length) ?? ''
    return !/^\s*(?:\)?\s*%|%\s*\)?)/.test(suffix)
  }).at(-1)?.[0]
  const inlineTaxMatch = eligibleTotalMatches.find((match) => inlineTaxAnnotationAmount(match))
  const categorySource = `${merchant ?? ''} ${lines.join(' ')}`.toLowerCase()
  let category = 'Uncategorized'
  if (/\b(cafe|coffee|restaurant|food|grocery|market|bakery)\b/.test(categorySource)) category = 'Meals'
  else if (/\b(taxi|uber|grab|fuel|petrol|parking|transit|airline)\b/.test(categorySource)) category = 'Transport'
  else if (/\b(hotel|lodging|accommodation)\b/.test(categorySource)) category = 'Travel'
  else if (/\b(pharmacy|clinic|medical|dental)\b/.test(categorySource)) category = 'Healthcare'
  else if (/\b(software|cloud|hosting|subscription)\b/.test(categorySource)) category = 'Software'
  return {
    date,
    description: merchant || 'Receipt',
    amount: totalMatch ? parseAmount(totalMatch[0]) : undefined,
    tax: taxMatch ? parseAmount(taxMatch) : inlineTaxMatch ? parseAmount(inlineTaxMatch[0]) : undefined,
    category,
    confidence: Math.max(20, Math.min(96, 96 - [date, merchant, totalMatch, currencyCodeDetected].filter((value) => !value).length * 16)),
    source: totalLine ? `Line ${lines.indexOf(totalLine) + 1}` : fileName || 'Receipt text',
  }
}

function qboFormatDate(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function qboFormatDateTime(date: Date) {
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${qboFormatDate(date)}${hour}${minute}${second}`
}

function qboNumber(value: number) {
  if (!Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

function qboUid(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `UID-${Math.abs(hash).toString(16)}`
}

function qboToAscii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, ' ')
}

function qboText(value: string) {
  return qboToAscii(value).replace(/[<>\r\n]/g, ' ').replace(/&/g, 'and').trim()
}

function qboGuessPostedDate(value?: string) {
  if (!value) return undefined
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return `${iso[1]}${iso[2].padStart(2, '0')}${iso[3].padStart(2, '0')}`

  const slash = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (!slash) return undefined
  const first = Number(slash[1])
  const second = Number(slash[2])
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
  const [month, day] = first > 12 ? [second, first] : [first, second]
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

function qboAmount(row: ExtractedRow) {
  if (row.amount !== undefined && Number.isFinite(row.amount)) return row.amount
  const deposit = row.deposit ?? 0
  const withdrawal = row.withdrawal ?? 0
  const tax = row.tax ?? 0
  return deposit - withdrawal - tax
}

function qboTransaction(row: ExtractedRow, index: number) {
  const posted = qboGuessPostedDate(row.date)
  if (!posted) return ''
  const amount = qboAmount(row)
  if (!Number.isFinite(amount) || amount === 0) return ''

  const description = qboText(row.description || 'Transaction')
  const fitid = qboUid(`${posted}:${amount}:${description}:${index}`)
  const type = amount < 0 ? 'DEBIT' : 'CREDIT'

  return [
    '<STMTTRN>',
    `<TRNTYPE>${type}`,
    `<DTPOSTED>${posted}`,
    `<TRNAMT>${qboNumber(amount)}`,
    `<FITID>${fitid}`,
    `<NAME>${description.slice(0, 32) || 'Transaction'}`,
    `<MEMO>${description.slice(0, 255)}`,
    '</STMTTRN>',
  ].join('\n')
}

function qboDateRange(rows: ExtractedRow[], period?: ConversionResult['statementPeriod']) {
  const explicitStart = period?.start ? qboGuessPostedDate(period.start) : undefined
  const explicitEnd = period?.end ? qboGuessPostedDate(period.end) : undefined

  const postedDates = rows
    .map((row) => qboGuessPostedDate(row.date))
    .filter((value): value is string => Boolean(value))
    .sort()

  return {
    startDate: explicitStart ?? postedDates[0],
    endDate: explicitEnd ?? postedDates[postedDates.length - 1],
  }
}

function qboLastBalance(rows: ExtractedRow[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const balance = rows[index]?.balance
    if (balance !== undefined && Number.isFinite(balance)) return balance
  }
  return undefined
}
