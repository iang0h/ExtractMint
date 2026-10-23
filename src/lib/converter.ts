import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getPersistentOcrText, setPersistentOcrText } from './ocrCache'
import { attachPdfPasswordPrompt } from './pdfPasswordPrompt.mjs'
import { getRowReview, lowerRowConfidence } from './reviewStatus'
import { getStatementIntegrityWarning } from './statementIntegrity'
import { summarizeRowAmounts, type AmountReadability } from './financialSummary'
import { scanQualityWarningFor } from './scanQuality'
import {
  canonicalStatementDate,
  detectStatementDateConvention,
  formatStatementDate,
  needsDateConventionChoice,
  type StatementDateConvention,
  type StatementDateFormat,
  statementPeriodLabel as formatStatementPeriodLabel,
} from './statementDates'

export { canonicalStatementDate } from './statementDates'

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
  edited?: boolean
  invalidEdits?: Partial<Record<'withdrawal' | 'deposit' | 'amount' | 'balance', string>>
  sourceLineNumbers?: number[]
}

export type ValidationIssue = {
  severity: 'info' | 'warning' | 'error'
  code?: 'balance-step-inconsistency' | 'source-line-unattached' | 'ambiguous-transaction-start' | 'invalid-row-edit'
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
  validatedRowIndexes?: number[]
  issues: ValidationIssue[]
}

export type SourceProvenance = {
  sourceLineCount: number
  consumedLineNumbers: number[]
  rowStartLineNumbers: number[]
  attachedLineNumbers: number[]
  unattachedLineNumbers: number[]
  ambiguousLineNumbers: number[]
  ignoredLineNumbers: number[]
}

export type StatementPeriod = {
  start?: string
  end?: string
  rawStart?: string
  rawEnd?: string
  source: 'explicit' | 'inferred'
}

export type ConversionResult = {
  workspaceOrigin?: 'sample-preview' | 'synthetic-sample' | 'upload'
  fileName: string
  fileType: string
  currencyCode: string
  statementPeriod?: StatementPeriod
  dateConvention?: StatementDateConvention
  closingBalanceDate?: string
  closingBalanceDateRaw?: string
  fileMeta: {
    size: number
    lastModified: number
    sha256?: string
  }
  rawText: string
  provenance?: SourceProvenance
  rows: ExtractedRow[]
  confidence: number
  validation: ValidationSummary
  pdfColumnMethods?: Array<{ page: number; method: 'header' | 'clusters' | 'legacy' | 'ocr' }>
  scanQualityWarning?: string
  scanAmountsUnreadable?: boolean
  scanBalancesUnreadable?: boolean
  processedAt: string
  summary: {
    title: string
    documentKind: string
    total?: number
    amountStatus?: AmountReadability
    vendor?: string
    receiptDate?: string
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

export function revalidateRows(
  rows: ExtractedRow[],
  currencyCode: string,
  seeds?: { openingBalance?: number; closingBalance?: number },
) {
  return validateBalances(rows, currencyCode, seeds)
}

export function refreshStatementPeriod(
  rows: ExtractedRow[],
  previous?: ConversionResult['statementPeriod'],
  convention?: StatementDateConvention,
): ConversionResult['statementPeriod'] | undefined {
  if (previous?.source === 'explicit') return previous
  const inferred = inferStatementPeriodFromRows(rows, convention)
  return inferred ? { ...inferred, source: 'inferred' } : undefined
}

export function applyDateConvention(result: ConversionResult, format: StatementDateFormat): ConversionResult {
  const dateConvention: StatementDateConvention = { format, source: 'user' }
  const statementPeriod = result.statementPeriod?.source === 'explicit'
    ? {
        ...result.statementPeriod,
        start: canonicalStatementDate(result.statementPeriod.rawStart ?? result.statementPeriod.start, dateConvention),
        end: canonicalStatementDate(result.statementPeriod.rawEnd ?? result.statementPeriod.end, dateConvention),
      }
    : refreshStatementPeriod(result.rows, undefined, dateConvention)
  return {
    ...result,
    dateConvention,
    statementPeriod,
    closingBalanceDate: canonicalStatementDate(result.closingBalanceDateRaw ?? result.closingBalanceDate, dateConvention),
  }
}

export function statementPeriodLabel(
  period?: ConversionResult['statementPeriod'],
  convention?: StatementDateConvention,
) {
  return formatStatementPeriodLabel(period, convention)
}

function dateRangeType(period?: ConversionResult['statementPeriod']) {
  if (!period) return ''
  return period.source === 'explicit' ? 'Statement period' : 'Transaction date range'
}

function dateRangeValue(value?: string, rawValue?: string, convention?: StatementDateConvention) {
  return formatStatementDate(value ?? rawValue, convention)
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

    const extractedText = await extractText(file, (event) => {
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

    const rawText = typeof extractedText === 'string' ? extractedText : extractedText.text
    const pdfColumnMethods = typeof extractedText === 'string' ? undefined : extractedText.pdfColumnMethods
    results.push(
      parseExtractedText(rawText, file.name, file.type || extensionOf(file.name), {
        size: file.size,
        lastModified: file.lastModified,
        sha256,
      }, pdfColumnMethods),
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

  return parseExtractedText(sample, 'sample-bank-statement.pdf', 'application/pdf', {
    size: sample.length,
    lastModified: Date.now(),
    sha256: 'sample',
  })
}

export async function createExcelBlob(result: ConversionResult) {
  assertExportableTransactionRows(result)
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
    { header: 'Date Range Type', key: 'dateRangeType', width: 24 },
    { header: 'Date Format', key: 'dateFormat', width: 18 },
    { header: 'Date Range Start', key: 'statementStart', width: 18 },
    { header: 'Date Range End', key: 'statementEnd', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Validation', key: 'validation', width: 18 },
    { header: 'Issues', key: 'issues', width: 12 },
    { header: 'SHA-256', key: 'sha256', width: 66 },
    { header: 'File size', key: 'size', width: 14 },
    { header: 'Last modified', key: 'lastModified', width: 22 },
    { header: 'Processed', key: 'processed', width: 26 },
    { header: 'Statement Warnings', key: 'statementWarnings', width: 90 },
    { header: 'Source Coverage', key: 'sourceCoverage', width: 60 },
  ]
  summary.addRow({
    file: result.fileName,
    kind: result.summary.documentKind,
    currency: result.currencyCode,
    dateRangeType: dateRangeType(result.statementPeriod),
    dateFormat: result.dateConvention?.format ?? (result.dateConvention?.source === 'ambiguous' || result.dateConvention?.source === 'conflict' ? 'Needs selection' : ''),
    statementStart: dateRangeValue(result.statementPeriod?.start, result.statementPeriod?.rawStart, result.dateConvention),
    statementEnd: dateRangeValue(result.statementPeriod?.end, result.statementPeriod?.rawEnd, result.dateConvention),
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
    statementWarnings: exportWarningText(result),
    sourceCoverage: sourceCoverageNote(result),
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
    { metric: 'Statement warnings', value: exportWarningText(result), notes: 'Review against the source before importing into accounting software.' },
    { metric: 'Source coverage', value: sourceCoverageNote(result), notes: 'Line numbers refer to extracted text. Coverage and balance checks do not establish the source transaction count.' },
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
      metric: dateRangeType(result.statementPeriod) || 'Date range',
      value: `${dateRangeValue(result.statementPeriod?.start, result.statementPeriod?.rawStart, result.dateConvention)}${dateRangeValue(result.statementPeriod?.end, result.statementPeriod?.rawEnd, result.dateConvention) ? ` → ${dateRangeValue(result.statementPeriod?.end, result.statementPeriod?.rawEnd, result.dateConvention)}` : ''}`,
      notes: result.dateConvention?.format ? `Format: ${result.dateConvention.format}` : 'Date format needs user selection when dates are ambiguous.',
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
    { header: 'Source Lines', key: 'sourceLines', width: 30 },
  ]
  ;['withdrawal', 'deposit', 'tax', 'amount', 'balance'].forEach((key) => {
    const column = rows.getColumn(key)
    column.numFmt = moneyFmt
    column.alignment = { horizontal: 'right' }
  })
  result.rows.forEach((row, index) => {
    rows.addRow({
      date: formatStatementDate(row.date, result.dateConvention),
      description: row.description,
      reference: row.reference ?? '',
      withdrawal: numberOrNull(row.withdrawal),
      deposit: numberOrNull(row.deposit),
      tax: numberOrNull(row.tax),
      amount: numberOrNull(signedTransactionAmount(row)),
      balance: numberOrNull(row.balance),
      reviewStatus: rowReviewStatus(result.validation, index),
      reviewNotes: rowReviewNotes(result.validation, index),
      category: row.category,
      confidence: `${row.confidence}%`,
      source: row.source,
      sourceLines: row.sourceLineNumbers?.join(', ') ?? '',
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
  results.forEach(assertExportableTransactionRows)
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
    { header: 'Date Range Type', key: 'dateRangeType', width: 24 },
    { header: 'Date Format', key: 'dateFormat', width: 18 },
    { header: 'Date Range Start', key: 'statementStart', width: 18 },
    { header: 'Date Range End', key: 'statementEnd', width: 18 },
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
    { header: 'Statement Warnings', key: 'statementWarnings', width: 90 },
    { header: 'Source Coverage', key: 'sourceCoverage', width: 60 },
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
    { header: 'Date Range Type', key: 'dateRangeType', width: 24 },
    { header: 'Date Range Start', key: 'statementStart', width: 18 },
    { header: 'Date Range End', key: 'statementEnd', width: 18 },
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
    { header: 'Statement Warnings', key: 'statementWarnings', width: 90 },
    { header: 'Source Coverage', key: 'sourceCoverage', width: 60 },
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
      dateRangeType: dateRangeType(result.statementPeriod),
      dateFormat: result.dateConvention?.format ?? (result.dateConvention?.source === 'ambiguous' || result.dateConvention?.source === 'conflict' ? 'Needs selection' : ''),
      statementStart: dateRangeValue(result.statementPeriod?.start, result.statementPeriod?.rawStart, result.dateConvention),
      statementEnd: dateRangeValue(result.statementPeriod?.end, result.statementPeriod?.rawEnd, result.dateConvention),
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
      statementWarnings: exportWarningText(result),
      sourceCoverage: sourceCoverageNote(result),
    })

    const reconciliation = reconciliationForResult(result)
    reconciliationSheet.addRow({
      file: result.fileName,
      currency: result.currencyCode,
      dateRangeType: dateRangeType(result.statementPeriod),
      statementStart: dateRangeValue(result.statementPeriod?.start, result.statementPeriod?.rawStart, result.dateConvention),
      statementEnd: dateRangeValue(result.statementPeriod?.end, result.statementPeriod?.rawEnd, result.dateConvention),
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
      statementWarnings: exportWarningText(result),
      sourceCoverage: sourceCoverageNote(result),
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
      { header: 'Source Lines', key: 'sourceLines', width: 30 },
    ]
    ;['withdrawal', 'deposit', 'tax', 'amount', 'balance'].forEach((key) => {
      const column = rowsSheet.getColumn(key)
      column.numFmt = moneyFmt
      column.alignment = { horizontal: 'right' }
    })
    result.rows.forEach((row, index) => {
      rowsSheet.addRow({
        date: formatStatementDate(row.date, result.dateConvention),
        description: row.description,
        reference: row.reference ?? '',
        withdrawal: numberOrNull(row.withdrawal),
        deposit: numberOrNull(row.deposit),
        tax: numberOrNull(row.tax),
        amount: numberOrNull(signedTransactionAmount(row)),
        balance: numberOrNull(row.balance),
        reviewStatus: rowReviewStatus(result.validation, index),
        reviewNotes: rowReviewNotes(result.validation, index),
        category: row.category,
        confidence: `${row.confidence}%`,
        source: row.source,
        sourceLines: row.sourceLineNumbers?.join(', ') ?? '',
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
  assertExportableTransactionRows(result)
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
      'Source Lines',
      'Statement Warnings',
      'Date Format',
    ],
    ...result.rows.map((row, index) => [
      formatStatementDate(row.date, result.dateConvention),
      row.description,
      row.reference ?? '',
      String(row.withdrawal ?? ''),
      String(row.deposit ?? ''),
      String(row.tax ?? ''),
      String(signedTransactionAmount(row) ?? ''),
      String(row.balance ?? ''),
      rowReviewStatus(result.validation, index),
      rowReviewNotes(result.validation, index),
      row.category,
      `${row.confidence}%`,
      row.source,
      row.sourceLineNumbers?.join(', ') ?? '',
      exportWarningText(result),
      result.dateConvention?.format ?? (result.dateConvention?.source === 'ambiguous' || result.dateConvention?.source === 'conflict' ? 'Needs selection' : ''),
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

function addSourceCoverageIssue(validation: ValidationSummary, provenance?: SourceProvenance) {
  if (!provenance) return
  if (provenance.unattachedLineNumbers.length > 0) {
    validation.issues.push({
      severity: 'warning',
      code: 'source-line-unattached',
      message: `Consumed source lines ${provenance.unattachedLineNumbers.join(', ')} were not attached to a row. Review the source for completeness.`,
    })
  }
  if (provenance.ambiguousLineNumbers.length > 0) {
    validation.issues.push({
      severity: 'warning',
      code: 'ambiguous-transaction-start',
      message: `Source lines ${provenance.ambiguousLineNumbers.join(', ')} contain ambiguous transaction starts. They remain description/review evidence rather than money rows; verify against the source.`,
    })
  }
  validation.issueCount = validation.issues.length
  if (provenance.unattachedLineNumbers.length > 0 || provenance.ambiguousLineNumbers.length > 0) validation.status = 'review'
}

function readSourceLineNumbers(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((line) => Number.isSafeInteger(line) && line > 0)
    ? [...value]
    : undefined
}

function readSourceProvenance(value: unknown): SourceProvenance | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const sourceLineCount = asFiniteNumber(record.sourceLineCount)
  const consumedLineNumbers = readSourceLineNumbers(record.consumedLineNumbers)
  const rowStartLineNumbers = readSourceLineNumbers(record.rowStartLineNumbers)
  const attachedLineNumbers = readSourceLineNumbers(record.attachedLineNumbers)
  const unattachedLineNumbers = readSourceLineNumbers(record.unattachedLineNumbers)
  const ignoredLineNumbers = readSourceLineNumbers(record.ignoredLineNumbers)
  const ambiguousLineNumbers = readSourceLineNumbers(record.ambiguousLineNumbers ?? [])
  if (sourceLineCount === undefined || !Number.isSafeInteger(sourceLineCount) || sourceLineCount < 0 ||
    !consumedLineNumbers || !rowStartLineNumbers || !attachedLineNumbers || !unattachedLineNumbers || !ignoredLineNumbers || !ambiguousLineNumbers) return undefined
  if ([...consumedLineNumbers, ...rowStartLineNumbers, ...attachedLineNumbers, ...unattachedLineNumbers, ...ignoredLineNumbers, ...ambiguousLineNumbers]
    .some((line) => line > sourceLineCount)) return undefined
  return { sourceLineCount, consumedLineNumbers, rowStartLineNumbers, attachedLineNumbers, unattachedLineNumbers, ambiguousLineNumbers, ignoredLineNumbers }
}

function sourceCoverageNote(result: ConversionResult) {
  const provenance = result.provenance
  if (!provenance) return 'Source coverage unavailable'
  return `${provenance.consumedLineNumbers.length} consumed; ${provenance.attachedLineNumbers.length} attached; ${provenance.rowStartLineNumbers.length} row starts; ${provenance.unattachedLineNumbers.length} unattached${provenance.unattachedLineNumbers.length ? ` (lines ${provenance.unattachedLineNumbers.join(', ')})` : ''}; ${provenance.ambiguousLineNumbers.length} ambiguous`
}

function exportWarningText(result: ConversionResult) {
  return [result.scanQualityWarning, getStatementIntegrityWarning(result)].filter(Boolean).join(' ')
}

function signedTransactionAmount(row: ExtractedRow) {
  if (typeof row.amount === 'number' && Number.isFinite(row.amount)) return row.amount
  if (row.deposit === undefined && row.withdrawal === undefined && row.tax === undefined) return undefined
  return (row.deposit ?? 0) - (row.withdrawal ?? 0) - (row.tax ?? 0)
}

function isTransactionRow(row: ExtractedRow) {
  const hasFinancialValue = row.amount !== undefined || row.withdrawal !== undefined || row.deposit !== undefined || row.tax !== undefined
  if (!row.date && !hasFinancialValue && row.category === 'Balance') return false
  return row.edited === true || row.date !== undefined || hasFinancialValue
}

function assertExportableTransactionRows(result: ConversionResult) {
  result.rows.forEach((row, index) => {
    const rowNumber = index + 1
    const invalidFields = Object.entries(row.invalidEdits ?? {}).filter(([, rawValue]) => typeof rawValue === 'string')
    if (invalidFields.length > 0) {
      const invalidField = invalidFields[0][0]
      throw new Error(`Export paused: Row ${rowNumber} has an invalid ${invalidField} edit. Enter a valid amount before exporting.`)
    }
    if (!isTransactionRow(row)) return
    const recognizedDate = canonicalStatementDate(row.date, result.dateConvention) ||
      (['DD/MM/YYYY', 'MM/DD/YYYY'] as const).some((format) =>
        canonicalStatementDate(row.date, { format, source: 'user' }),
      )
    if (!recognizedDate) {
      throw new Error(`Export paused: Row ${rowNumber} needs a resolved date. Review the row before exporting.`)
    }

    const amount = signedTransactionAmount(row)
    if (amount === undefined || !Number.isFinite(amount)) {
      throw new Error(`Export paused: Row ${rowNumber} needs a resolved amount. Review the row before exporting.`)
    }
    if (row.deposit !== undefined && row.withdrawal !== undefined) {
      throw new Error(`Export paused: Row ${rowNumber} has both a withdrawal and a deposit. Resolve the direction before exporting.`)
    }
    if ((row.withdrawal !== undefined && amount > 0) || (row.deposit !== undefined && amount < 0)) {
      throw new Error(`Export paused: Row ${rowNumber} has conflicting amount and direction values. Review the row before exporting.`)
    }
  })
}

function totalsForResult(result: ConversionResult) {
  const amounts = summarizeRowAmounts(
    result.rows,
    result.summary.documentKind,
    result.scanAmountsUnreadable === true || result.summary.amountStatus === 'unreadable',
  )
  return {
    amount: amounts.transactionNet,
    withdrawal: amounts.withdrawals,
    deposit: amounts.deposits,
    tax: result.rows.reduce((sum, row) => sum + (row.tax ?? 0), 0),
  }
}

function reconciliationForResult(result: ConversionResult) {
  const totals = summarizeRowAmounts(
    result.rows,
    result.summary.documentKind,
    result.scanAmountsUnreadable === true || result.summary.amountStatus === 'unreadable',
  )
  const openingBalance = result.validation.openingBalance
  const closingBalance = result.validation.closingBalance
  const netChange =
    openingBalance !== undefined && closingBalance !== undefined
      ? roundMoney(closingBalance - openingBalance)
      : undefined

  const transactionNet = totals.transactionNet

  const discrepancy =
    netChange !== undefined && transactionNet !== undefined ? roundMoney(netChange - transactionNet) : undefined

  return {
    openingBalance,
    closingBalance,
    netChange,
    deposits: totals.deposits,
    withdrawals: totals.withdrawals,
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
  if (result.scanAmountsUnreadable) {
    throw new Error('Export paused: Amounts are not readable from this scanned document. QBO is unavailable until transaction amounts are resolved.')
  }
  if (needsDateConventionChoice(result.rows, result.statementPeriod, result.dateConvention, result.closingBalanceDateRaw ?? result.closingBalanceDate)) {
    throw new Error('Choose DD/MM/YYYY or MM/DD/YYYY before exporting QBO dates.')
  }
  assertExportableTransactionRows(result)

  const { startDate, endDate } = qboDateRange(result.rows, result.statementPeriod, result.dateConvention)
  const closingAsOf = canonicalStatementDate(result.closingBalanceDateRaw ?? result.closingBalanceDate, result.dateConvention)
  const openingBalance = result.validation.openingBalance
  const closingBalance = result.validation.closingBalance ?? qboLastBalance(result.rows)

  const transactions = result.rows
    .map((row, index) => qboTransaction(row, index, result.dateConvention, result.validation))
    .filter(Boolean)
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

  if (closingBalance !== undefined && closingAsOf) {
    parts.push(
      [
        '<LEDGERBAL>',
        `<BALAMT>${qboNumber(closingBalance)}`,
        closingAsOf ? `<DTASOF>${closingAsOf.replaceAll('-', '')}` : '',
        '</LEDGERBAL>',
      ].filter(Boolean).join('\n'),
    )
  }

  if (openingBalance !== undefined && result.statementPeriod?.source === 'explicit' && startDate) {
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
  assertExportableTransactionRows(result)
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
          formatStatementDate(row.date, result.dateConvention),
            row.description,
            row.reference ?? '',
            money(row.withdrawal, result.currencyCode),
            money(row.deposit, result.currencyCode),
            money(row.tax, result.currencyCode),
            money(signedTransactionAmount(row), result.currencyCode),
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
          ...(result.statementPeriod?.start || result.statementPeriod?.end || result.statementPeriod?.rawStart || result.statementPeriod?.rawEnd
            ? [
                new Paragraph(
                  statementPeriodLabel(result.statementPeriod, result.dateConvention),
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
  assertExportableTransactionRows(result)
  return createPdfBlobAsync(result)
}

export function createReviewJsonBlob(result: ConversionResult) {
  const payload = {
    schema: 'extractmint.review.v2',
    createdAt: new Date().toISOString(),
    fileName: result.fileName,
    fileType: result.fileType,
    currencyCode: result.currencyCode,
    statementPeriod: result.statementPeriod,
    dateConvention: result.dateConvention,
    closingBalanceDate: result.closingBalanceDate,
    closingBalanceDateRaw: result.closingBalanceDateRaw,
    fileMeta: result.fileMeta,
    processedAt: result.processedAt,
    confidence: result.confidence,
    summary: result.summary,
    rows: result.rows,
    rowCount: result.rows.length,
    provenance: result.provenance,
    scanAmountsUnreadable: result.scanAmountsUnreadable,
    scanBalancesUnreadable: result.scanBalancesUnreadable,
    scanQualityWarning: result.scanQualityWarning,
    totals: {
      amount: result.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
      withdrawal: result.rows.reduce((sum, row) => sum + (row.withdrawal ?? 0), 0),
      deposit: result.rows.reduce((sum, row) => sum + (row.deposit ?? 0), 0),
      balanceCount: result.rows.reduce((sum, row) => sum + (row.balance !== undefined ? 1 : 0), 0),
    },
    validation: {
      ...result.validation,
      validatedRowIndexes: undefined,
    },
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

    const invalidEditsRecord = typeof record.invalidEdits === 'object' && record.invalidEdits
      ? record.invalidEdits as Record<string, unknown>
      : undefined
    const invalidEdits = invalidEditsRecord
      ? Object.fromEntries(
          Object.entries(invalidEditsRecord).filter(([field, rawValue]) =>
            ['withdrawal', 'deposit', 'amount', 'balance'].includes(field) && typeof rawValue === 'string',
          ),
        ) as ExtractedRow['invalidEdits']
      : undefined

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
      edited: record.edited === true,
      invalidEdits,
      sourceLineNumbers: readSourceLineNumbers(record.sourceLineNumbers),
    }
  })

  const provenance = readSourceProvenance(payload.provenance)
  const validation = revalidateRows(rows, currencyCode)
  addSourceCoverageIssue(validation, provenance)
  rows.forEach((row, rowIndex) => {
    Object.keys(row.invalidEdits ?? {}).forEach((field) => {
      validation.issues.push({
        severity: 'error',
        code: 'invalid-row-edit',
        rowIndex,
        message: `The ${field} value could not be read. Enter a valid amount before exporting.`,
      })
    })
  })
  validation.issueCount = validation.issues.length
  if (rows.some((row) => Object.keys(row.invalidEdits ?? {}).length > 0)) validation.status = 'review'
  const importedPeriod = typeof payload.statementPeriod === 'object' && payload.statementPeriod
    ? payload.statementPeriod as ConversionResult['statementPeriod']
    : undefined
  const closingBalanceDateRaw = asString(payload.closingBalanceDateRaw) ?? asString(payload.closingBalanceDate)
  const dateConventionValue = typeof payload.dateConvention === 'object' && payload.dateConvention
    ? payload.dateConvention as StatementDateConvention
    : undefined
  const validDateConventionSource = dateConventionValue &&
    ['document', 'metadata', 'user', 'ambiguous', 'conflict'].includes(dateConventionValue.source)
  const unresolvedDateConvention = dateConventionValue?.source === 'ambiguous' || dateConventionValue?.source === 'conflict'
  const validDateConventionFormat = dateConventionValue &&
    ['DD/MM/YYYY', 'MM/DD/YYYY'].includes(dateConventionValue.format ?? '')
  const dateEvidenceLines = [
    ...(importedPeriod?.source === 'explicit'
      ? [`Statement period: ${importedPeriod.rawStart ?? importedPeriod.start ?? ''} to ${importedPeriod.rawEnd ?? importedPeriod.end ?? ''}`]
      : []),
    ...(closingBalanceDateRaw ? [`CLOSING BALANCE AS OF ${closingBalanceDateRaw}`] : []),
  ]
  const dateConvention = validDateConventionSource && (unresolvedDateConvention
    ? dateConventionValue?.format === undefined
    : validDateConventionFormat)
    ? dateConventionValue
    : detectStatementDateConvention(dateEvidenceLines, rows)
  const statementPeriod = importedPeriod?.source === 'explicit'
    ? {
        ...importedPeriod,
        rawStart: importedPeriod.rawStart ?? importedPeriod.start,
        rawEnd: importedPeriod.rawEnd ?? importedPeriod.end,
        start: canonicalStatementDate(importedPeriod.rawStart ?? importedPeriod.start, dateConvention),
        end: canonicalStatementDate(importedPeriod.rawEnd ?? importedPeriod.end, dateConvention),
      }
    : refreshStatementPeriod(rows, undefined, dateConvention)
  const scanAmountsUnreadable = payload.scanAmountsUnreadable === true
  const scanQualityWarning = asString(payload.scanQualityWarning)
  const scanBalancesUnreadable = payload.scanBalancesUnreadable === true ||
    (payload.scanBalancesUnreadable === undefined && /running-balance values could not be read/i.test(scanQualityWarning ?? ''))
  const importedAmounts = summarizeRowAmounts(rows, summary.documentKind, scanAmountsUnreadable)
  const importedSummary = {
    ...summary,
    total: importedAmounts.totalDetected,
    amountStatus: importedAmounts.amountStatus,
  }
  return {
    fileName,
    fileType,
    currencyCode,
    statementPeriod,
    dateConvention,
    closingBalanceDate: canonicalStatementDate(closingBalanceDateRaw, dateConvention),
    closingBalanceDateRaw,
    fileMeta,
    rawText: '',
    provenance,
    rows,
    confidence: asFiniteNumber(payload.confidence) ?? Math.round((importedSummary.total ?? 0) > 0 ? 84 : 0),
    validation,
    scanQualityWarning: scanQualityWarning ?? scanQualityWarningFor(scanAmountsUnreadable, scanBalancesUnreadable),
    scanAmountsUnreadable,
    scanBalancesUnreadable,
    processedAt,
    summary: importedSummary,
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
    root.file(`${baseName}.xlsx`, await xlsx.arrayBuffer())
    root.file(`${baseName}.extractmint-review.json`, await json.arrayBuffer())
  }

  const manifest: Array<{ sha256: string; fileName: string; mimeType: string; size: number; path: string }> = []
  const entries = sourcesBySha ? Object.entries(sourcesBySha) : []
  for (const [sha256, source] of entries) {
    if (!sha256 || !source?.blob) continue
    const safeName = sanitizeZipName(source.fileName || `${sha256}`)
    const path = `sources/${sha256}-${safeName}`
    sourcesFolder.file(`${sha256}-${safeName}`, await source.blob.arrayBuffer())
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
  if (result.statementPeriod?.start || result.statementPeriod?.end || result.statementPeriod?.rawStart || result.statementPeriod?.rawEnd) {
    pdf.text(
      statementPeriodLabel(result.statementPeriod, result.dateConvention),
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
  result.rows.forEach((row, index) => {
    if (y > 742) {
      pdf.addPage()
      y = margin
    }
    pdf.text(formatStatementDate(row.date, result.dateConvention) || '-', margin, y)
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
  const pdfColumnMethods: NonNullable<ConversionResult['pdfColumnMethods']> = []
  const signature = fileSignature(file)
  const ocrLanguage = normalizeOcrLanguage(options.ocrLanguage)

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = formatPdfTextItems(content.items)
    chunks.push(`Page ${pageNumber}\n${pageText.text}`)
    pdfColumnMethods.push({ page: pageNumber, method: pageText.method })
    console.debug('[ExtractMint] PDF column assignment', { page: pageNumber, method: pageText.method })
    onProgress({
      fileName: file.name,
      stage: 'reading',
      percent: Math.round((pageNumber / pdf.numPages) * 72),
      detail: `Read page ${pageNumber} of ${pdf.numPages}`,
    })
  }

  const extracted = chunks.join('\n')
  const extractedDensity = extracted.replace(/\s+/g, '').length / Math.max(pdf.numPages, 1)

  if (!options.forceOcr && extractedDensity >= 220) return { text: extracted, pdfColumnMethods }

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

  const ocrText = ocrChunks.join('\n')
  const ocrMethods = Array.from({ length: pdf.numPages }, (_, index) => ({ page: index + 1, method: 'ocr' as const }))
  console.debug('[ExtractMint] PDF column assignment', { page: 'all', method: 'ocr' })
  return { text: ocrText, pdfColumnMethods: ocrMethods }
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

type PdfColumnAnchor = { index: number; right: number }
type PdfColumnMethod = 'header' | 'clusters' | 'legacy'

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

  const orderedLines = lines.sort((a, b) => b[0].y - a[0].y).map((line) => line.sort((a, b) => a.x - b.x))
  const headerAnchors = findPdfHeaderAnchors(orderedLines)
  const moneyAnchors = headerAnchors ? [] : findPdfMoneyAnchors(orderedLines)
  const method: PdfColumnMethod = headerAnchors ? 'header' : moneyAnchors.length >= 2 ? 'clusters' : 'legacy'
  const text = orderedLines
    .map((line) => {
      if (headerAnchors) return formatPdfLine(line, headerAnchors)
      if (method === 'clusters') return formatPdfLineFromClusters(line, moneyAnchors)
      return formatPdfLine(line)
    })
    .filter(Boolean)
    .join('\n')
  return { text, method }
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

function formatPdfLine(line: PositionedText[], anchors?: PdfColumnAnchor[]) {
  const columns = ['', '', '', '', '', '', '']

  line.forEach((item) => {
    const columnIndex = anchors ? columnForHeaderAnchors(item, anchors) : columnForX(item.x)
    if (columnIndex < 0) return
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

function findPdfHeaderAnchors(lines: PositionedText[][]) {
  for (const line of lines) {
    const anchors: PdfColumnAnchor[] = []
    line.forEach((item) => {
      const index = headerColumnIndex(item.str)
      if (index !== undefined) anchors.push({ index, right: item.x + item.width })
    })
    const indexed = new Set(anchors.map(({ index }) => index))
    if (indexed.has(0) && indexed.has(1) && indexed.has(3) && indexed.has(4) && indexed.has(6)) {
      return anchors
    }
  }
  return undefined
}

function headerColumnIndex(value: string) {
  const text = value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (/^(date|transaction date|posting date|value date)(\b|\s)/i.test(text)) return 0
  if (/^(description|details|narrative|transaction description|particulars)(\b|\s)/i.test(text)) return 1
  if (/^(reference|ref(\s*no)?|transaction id)(\b|\s)/i.test(text)) return 2
  if (/^(debit|debits|withdrawal|withdrawals|money out|paid out|outgoing)(\b|\s)/i.test(text)) return 3
  if (/^(credit|credits|deposit|deposits|money in|paid in|incoming)(\b|\s)/i.test(text)) return 4
  if (/^(tax|fee)(\b|\s)/i.test(text)) return 5
  if (/^(balance|running balance|available balance)(\b|\s)/i.test(text)) return 6
  return undefined
}

function columnForHeaderAnchors(item: PositionedText, anchors: PdfColumnAnchor[]) {
  const direct = headerColumnIndex(item.str)
  if (direct !== undefined) return direct
  const edge = item.x + item.width
  return anchors.reduce((best, anchor) => {
    const distance = Math.abs(anchor.right - edge)
    return distance < best.distance ? { index: anchor.index, distance } : best
  }, { index: anchors[0]?.index ?? 1, distance: Number.POSITIVE_INFINITY }).index
}

function findPdfMoneyAnchors(lines: PositionedText[][]) {
  const edges = lines
    .flat()
    .filter((item) => looksLikePositionedMoney(item.str))
    .map((item) => item.x + item.width)
    .sort((a, b) => a - b)
  const clusters: number[][] = []
  edges.forEach((edge) => {
    const latest = clusters.at(-1)
    if (latest && Math.abs(latest.reduce((sum, value) => sum + value, 0) / latest.length - edge) <= 14) {
      latest.push(edge)
    } else {
      clusters.push([edge])
    }
  })
  return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length)
}

function looksLikePositionedMoney(value: string) {
  const text = value.trim()
  if (!text || datePattern.test(text)) return false
  return /(?:[$€£]|[+-]|\(|\)|,|\.\d{2}\b)/.test(text) && /^[-+]?[$€£]?\s*\(?[\d,]+(?:\.\d{1,2})?\)?$/.test(text)
}

function formatPdfLineFromClusters(line: PositionedText[], anchors: number[]) {
  const columns = ['', '', '', '', '', '', '']
  const amountColumns = anchors.length >= 3
    ? anchors.map((_, index) => index === 0 ? 3 : index === anchors.length - 1 ? 6 : index === 1 ? 4 : 5)
    : [3, 6]

  line.forEach((item) => {
    let columnIndex: number
    if (looksLikePositionedMoney(item.str)) {
      const edge = item.x + item.width
      const clusterIndex = anchors.reduce((best, value, index) =>
        Math.abs(value - edge) < Math.abs(anchors[best] - edge) ? index : best, 0)
      columnIndex = amountColumns[clusterIndex] ?? 6
    } else if (datePattern.test(item.str)) {
      columnIndex = 0
    } else {
      const left = anchors[0] ?? Number.POSITIVE_INFINITY
      columnIndex = item.x < left - 90 ? 1 : item.x < left - 20 ? 2 : 1
    }
    columns[columnIndex] = [columns[columnIndex], item.str].filter(Boolean).join(' ')
  })

  return trimTrailingEmptyColumns(columns).join('\t')
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

export function parseExtractedText(
  rawText: string,
  fileName: string,
  fileType: string,
  fileMeta: ConversionResult['fileMeta'],
  pdfColumnMethods?: ConversionResult['pdfColumnMethods'],
): ConversionResult {
  const normalized = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/^ +| +$/g, ''))

  const structured = parseStatementTable(lines)
  const parsed = structured.rows.length > 0 ? structured : parseUnstructuredStatement(lines)
  const rows = parsed.rows
  const fallbackRows = rows.length > 0 ? rows : buildFallbackRows(lines)
  const dateConvention = detectStatementDateConvention(lines, fallbackRows)
  const statementPeriod = detectStatementPeriod(lines, fallbackRows, dateConvention)
  const closingBalanceDate = detectClosingBalanceDate(lines, dateConvention)
  const currencyCode = detectCurrencyCode(normalized, fileName)
  const validation = validateBalances(fallbackRows, currencyCode)
  addSourceCoverageIssue(validation, parsed.provenance)
  if (pdfColumnMethods?.some(({ method }) => method !== 'header')) {
    const fallbackIssues = fallbackRows.flatMap((row, rowIndex) => row.date ? [{
      severity: 'warning' as const,
      rowIndex,
      message: 'PDF columns were assigned using a layout fallback. Verify this row against the statement.',
    }] : [])
    validation.issues.push(...fallbackIssues)
    validation.issueCount = validation.issues.length
    if (fallbackIssues.length > 0) validation.status = 'review'
  }
  const parsedDatedRows = fallbackRows.filter((row) => Boolean(row.date))
  const ocrProducedNoUsableRows = fallbackRows.every((row) => !row.date && row.amount === undefined)
  const usedOcr = pdfColumnMethods?.some(({ method }) => method === 'ocr') === true
  const scanAmountsUnreadable = usedOcr && (
    ocrProducedNoUsableRows ||
    parsedDatedRows.some((row) => row.amount === undefined) ||
    (parsed.provenance?.unattachedLineNumbers.length ?? 0) > 0
  )
  const scanBalancesUnreadable = usedOcr && parsedDatedRows.some((row) => row.balance === undefined)
  const scanQualityWarning = scanQualityWarningFor(scanAmountsUnreadable, scanBalancesUnreadable)
  if (scanQualityWarning) {
    validation.issues.push({ severity: 'warning', message: scanQualityWarning })
    validation.issueCount = validation.issues.length
    validation.status = 'review'
  }
  const reviewedRows = lowerRowConfidence(fallbackRows, validation)
  const summary = summarize(lines, reviewedRows, fileName, validation, scanAmountsUnreadable)
  const confidence = Math.min(
    scoreConfidence(fileType, reviewedRows, normalized, validation),
    pdfColumnMethods?.some(({ method }) => method !== 'header') ? 68 : 98,
    scanQualityWarning ? 55 : 98,
  )

  return {
    fileName,
    fileType,
    currencyCode,
    statementPeriod,
    dateConvention,
    closingBalanceDate: closingBalanceDate.date,
    closingBalanceDateRaw: closingBalanceDate.raw,
    fileMeta,
    rawText: normalized,
    provenance: rows.length > 0 ? parsed.provenance : undefined,
    rows: reviewedRows,
    confidence,
    validation,
    pdfColumnMethods,
    scanQualityWarning,
    scanAmountsUnreadable,
    scanBalancesUnreadable,
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
  const dateMatch = flatLine.match(datePattern)
  const date = dateMatch?.index === 0 ? dateMatch[0] : undefined
  const amountMatches = flatLine.match(amountPattern) ?? []
  const parsedAmounts = amountMatches.map(parseAmount).filter(isFinite)

  const balanceLabel = flatLine.match(/\b(OPENING BALANCE|CLOSING BALANCE|BALANCE BROUGHT FORWARD|BALANCE CARRIED FORWARD)\b/i)?.[0]
  if (balanceLabel && parsedAmounts.length > 0) {
    const opening = /OPENING|BROUGHT FORWARD/i.test(balanceLabel)
    return [{
      description: opening ? 'OPENING BALANCE' : 'CLOSING BALANCE',
      balance: parsedAmounts.at(-1),
      category: 'Balance',
      confidence: 96,
      source: `Line ${lineNumber}`,
      sourceLineNumbers: [lineNumber],
    }]
  }

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
      sourceLineNumbers: [lineNumber],
    },
  ]
}

function parseStatementTable(lines: string[]) {
  const hasStatementColumns = lines.some(
    (line) => line.includes('\t') && /Withdrawal|Pengeluaran|Deposits|Deposit|Balance|Baki/i.test(line),
  )
  const rows: ExtractedRow[] = []
  const consumed = new Set<number>()
  let inTable = false
  let current: (ExtractedRow & { descriptionParts: string[] }) | undefined

  const finishCurrent = () => {
    if (!current) return
    const { descriptionParts, ...row } = current
    row.description = compactDescription(descriptionParts)
    row.category = classifyStructuredRow(row.description, row.amount)
    row.confidence = row.balance !== undefined && row.amount !== undefined ? 98 : 84
    rows.push(row)
    current = undefined
  }
  const financialCells = (columns: string[]) => {
    const withdrawal = parseMoneyCell(columns[3])
    const deposit = parseMoneyCell(columns[4])
    return {
      withdrawal,
      deposit,
      tax: parseMoneyCell(columns[5]),
      balance: parseMoneyCell(columns[6]),
      amount: deposit ?? (withdrawal !== undefined ? -withdrawal : undefined),
    }
  }
  // A date alone is insufficient: multiline statements can put money on a later
  // description line. Look within this group for amount/balance column evidence.
  const hasDeferredFinancials = (start: number) => {
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index]
      if (isStatementNoise(line)) continue
      const columns = splitStatementColumns(line)
      if (columns[0].match(datePattern)?.index === 0 && line.includes('\t')) return false
      if (/^(OPENING|CLOSING) BALANCE/i.test(columns[1])) return false
      const cells = financialCells(columns)
      if (cells.amount !== undefined || cells.balance !== undefined) return true
    }
    return false
  }

  if (hasStatementColumns) lines.forEach((line, index) => {
    const sourceLine = index + 1
    const columns = splitStatementColumns(line)
    const [dateColumn, descriptionColumn, referenceColumn] = columns
    if (isStatementNoise(line)) return
    const cells = financialCells(columns)
    const dateMatch = dateColumn.match(datePattern)
    const candidateDate = dateMatch?.index === 0 ? dateMatch[0] : undefined
    const hasFinancials = cells.amount !== undefined || cells.balance !== undefined
    const startsTransaction = Boolean(candidateDate && line.includes('\t') &&
      (hasFinancials || (dateColumn === candidateDate && hasDeferredFinancials(index))))

    if (/^OPENING BALANCE$/i.test(descriptionColumn) || /^CLOSING BALANCE/i.test(descriptionColumn)) {
      finishCurrent()
      inTable = true
      consumed.add(sourceLine)
      rows.push({
        description: descriptionColumn,
        balance: cells.balance,
        category: 'Balance',
        confidence: 96,
        source: `Line ${sourceLine}`,
        sourceLineNumbers: [sourceLine],
      })
      return
    }
    if (startsTransaction && candidateDate) {
      finishCurrent()
      inTable = true
      consumed.add(sourceLine)
      const initialDescription = dateColumn.replace(candidateDate, '').trim()
      current = {
        date: candidateDate,
        description: initialDescription,
        descriptionParts: [initialDescription, descriptionColumn],
        reference: referenceColumn || undefined,
        ...cells,
        category: 'Transaction',
        confidence: 84,
        source: `Line ${sourceLine}`,
        sourceLineNumbers: [sourceLine],
      }
      return
    }
    if (!inTable) return
    consumed.add(sourceLine)
    if (!current) return
    // A dated table row with no financial evidence remains unattached for review.
    // A standalone dated memo or date-like description cell is a continuation.
    if (candidateDate && line.includes('\t') && dateColumn === candidateDate) return
    if (hasFinancials) {
      const fields = ['withdrawal', 'deposit', 'tax', 'balance', 'amount'] as const
      // Attach complementary cells only. Conflicting values remain unattached
      // for review; grouping must never overwrite source money to reconcile it.
      if (fields.some((field) => cells[field] !== undefined && current?.[field] !== undefined && cells[field] !== current[field])) return
      fields.forEach((field) => {
        if (current && cells[field] !== undefined) current[field] = cells[field]
      })
    }
    const description = line.includes('\t')
      ? [dateColumn, descriptionColumn].filter(Boolean).join(' ')
      : line
    if (description) current.descriptionParts.push(description)
    if (referenceColumn) current.reference = [current.reference, referenceColumn].filter(Boolean).join(' ')
    if (description || referenceColumn || hasFinancials) current.sourceLineNumbers?.push(sourceLine)
  })
  finishCurrent()
  return { rows, provenance: sourceProvenance(lines, rows, consumed) }
}

function parseUnstructuredStatement(lines: string[]) {
  const rows: ExtractedRow[] = []
  const consumed = new Set<number>()
  const ambiguous = new Set<number>()
  let current: ExtractedRow | undefined
  let inStatement = false
  const hasTrailingFinancialPair = (line: string) => {
    const tokens = [...line.matchAll(amountPattern)]
    const amount = tokens.at(-2)
    const balance = tokens.at(-1)
    if (!amount || !balance) return false
    // Adjacent terminal money fields provide an amount/balance layout pattern.
    // Numbers separated by narrative words are still description evidence.
    return /^\s+$/.test(line.slice(amount.index + amount[0].length, balance.index)) &&
      balance.index + balance[0].length === line.trimEnd().length
  }
  let explicitPairColumns = false
  const isExplicitPairHeader = (line: string) =>
    /^(?:Date|Transaction Date|Posting Date|Value Date) (?:Description|Details|Narrative|Particulars) (?:Amount|Signed Amount) (?:Balance|Running Balance)$/i.test(line.replace(/\s+/g, ' ').trim())
  const supportedByBalanceContext = (candidate: ExtractedRow, sourceIndex: number) => {
    const previousBalanceIndex = rows.findLastIndex((row) => row.balance !== undefined)
    const previousBalance = rows[previousBalanceIndex]?.balance
    if (previousBalance === undefined || candidate.amount === undefined) return false
    const intervening = rows.slice(previousBalanceIndex + 1)
    if (intervening.some((row) => row.amount === undefined)) return false
    const expected = previousBalance + intervening.reduce((sum, row) => sum + (row.amount ?? 0), 0) + candidate.amount
    if (candidate.balance !== undefined) return roundMoney(expected) === roundMoney(candidate.balance)
    for (let index = sourceIndex + 1; index < lines.length; index += 1) {
      if (isStatementNoise(lines[index])) continue
      const next = parseLine(lines[index], index + 1)[0]
      if (!next) continue
      if (next.balance !== undefined && (next.category === 'Balance' || hasTrailingFinancialPair(lines[index]))) {
        const movement = next.category === 'Balance' ? 0 : next.amount
        return movement !== undefined && roundMoney(expected + movement) === roundMoney(next.balance)
      }
      // Another potential transaction prevents independent support for this one.
      if (next.date) return false
    }
    return false
  }
  lines.forEach((line, index) => {
    if (isExplicitPairHeader(line)) {
      explicitPairColumns = true
      return
    }
    if (isStatementNoise(line)) return
    const sourceLine = index + 1
    const candidate = parseLine(line, sourceLine)[0]
    const dateMatch = line.match(datePattern)
    const startsWithDate = dateMatch?.index === 0
    // A trailing number alone does not distinguish a dated memo from a row.
    // Only a recognized source header establishes plain-text amount/balance
    // columns independently of reconciliation. Repeated numeric styling alone
    // does not prove layout; headerless candidates need balance context.
    const lastMoneyToken = line.match(amountPattern)?.at(-1)
    const trailingMoney = lastMoneyToken !== undefined && line.trim().endsWith(lastMoneyToken)
    const sparseRowEvidence = candidate?.balance === undefined && trailingMoney && candidate && supportedByBalanceContext(candidate, index)
    const balanceRowEvidence = candidate?.balance !== undefined && hasTrailingFinancialPair(line) &&
      (explicitPairColumns || supportedByBalanceContext(candidate, index))
    const datedMemo = candidate?.date && !balanceRowEvidence && !sparseRowEvidence
    if (candidate && !datedMemo) {
      rows.push(candidate)
      consumed.add(sourceLine)
      inStatement = true
      current = candidate.date ? candidate : undefined
      if (/^CLOSING BALANCE/i.test(candidate.description)) explicitPairColumns = false
      return
    }
    if (datedMemo) {
      consumed.add(sourceLine)
      ambiguous.add(sourceLine)
      if (current) {
        current.description = compactDescription([current.description, line])
        current.sourceLineNumbers?.push(sourceLine)
      } else {
        rows.push({ description: line, category: 'Review', confidence: 20, source: `Line ${sourceLine}`, sourceLineNumbers: [sourceLine] })
      }
      inStatement = true
      return
    }
    if (!inStatement) return
    consumed.add(sourceLine)
    // Retain unreadable dated lines as unattached evidence, not invented rows.
    if (startsWithDate && !candidate && !(line.match(amountPattern)?.length)) return
    if (current) {
      current.description = compactDescription([current.description, line])
      current.sourceLineNumbers?.push(sourceLine)
    }
  })
  return { rows, provenance: sourceProvenance(lines, rows, consumed, ambiguous) }
}

function sourceProvenance(lines: string[], rows: ExtractedRow[], consumed: Set<number>, ambiguous = new Set<number>()): SourceProvenance {
  const attached = new Set(rows.flatMap((row) => row.sourceLineNumbers ?? []))
  return {
    sourceLineCount: lines.length,
    consumedLineNumbers: [...consumed],
    rowStartLineNumbers: rows.flatMap((row) => row.sourceLineNumbers?.slice(0, 1) ?? []),
    attachedLineNumbers: [...attached].sort((a, b) => a - b),
    unattachedLineNumbers: [...consumed].filter((line) => !attached.has(line)),
    ambiguousLineNumbers: [...ambiguous],
    ignoredLineNumbers: lines.flatMap((_, index) => consumed.has(index + 1) ? [] : [index + 1]),
  }
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
    /^Page \/|^Halaman$|^Page \d+(?: of \d+)?$/i.test(text) ||
    /^Statement Date \/|^Tarikh Penyata$|^Should you have|^or call our CIMB/i.test(text) ||
    /\b(statement period|important notice|please note|effective from|effective on|terms and conditions|fee schedule|contact us|page \d+ of \d+)\b/i.test(text) ||
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
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
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

function normalizeIsoRange(start?: string, end?: string) {
  if (!start && !end) return undefined
  if (start && end && start > end) return { start: end, end: start }
  return { start, end }
}

function detectStatementPeriod(
  lines: string[],
  rows: ExtractedRow[],
  convention?: StatementDateConvention,
): ConversionResult['statementPeriod'] | undefined {
  for (const line of lines) {
    const text = line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (!/(statement\s*(period|from|to)|period\s*(from|to)|for\s+the\s+period)/i.test(text)) continue

    const dates = extractDatesFromLine(text)
    if (dates.length < 2) continue
    const rawStart = dates[0]
    const rawEnd = dates[1]
    const first = canonicalStatementDate(rawStart, convention)
    const second = canonicalStatementDate(rawEnd, convention)
    const normalized = normalizeIsoRange(first, second)
    return {
      ...normalized,
      rawStart: first && second && first > second ? rawEnd : rawStart,
      rawEnd: first && second && first > second ? rawStart : rawEnd,
      source: 'explicit',
    }
  }

  const inferred = inferStatementPeriodFromRows(rows, convention)
  return inferred ? { ...inferred, source: 'inferred' } : undefined
}

function inferStatementPeriodFromRows(rows: ExtractedRow[], convention?: StatementDateConvention) {
  const parsed = rows
    .map((row) => ({ raw: row.date, date: canonicalStatementDate(row.date, convention) }))
    .filter((value): value is { raw: string; date: string } => Boolean(value.raw && value.date))
    .sort((left, right) => left.date.localeCompare(right.date))
  if (parsed.length === 0) return undefined
  const first = parsed[0]
  const last = parsed[parsed.length - 1]
  return {
    ...normalizeIsoRange(first.date, last.date),
    rawStart: first.raw,
    rawEnd: last.raw,
  }
}

function detectClosingBalanceDate(lines: string[], convention?: StatementDateConvention) {
  const line = [...lines].reverse().find((candidate) => /\b(?:closing|ending|final) balance\b/i.test(candidate))
  const raw = line ? extractDatesFromLine(line).at(-1) : undefined
  return { raw, date: canonicalStatementDate(raw, convention) }
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
  scanAmountsUnreadable = false,
) {
  const firstMeaningful = lines.find((line) => /[a-z]/i.test(line)) ?? fileName
  const totalLine =
    lines.find((line) => /\b(total|amount due|grand total|balance due)\b/i.test(line)) ??
    ''
  const lower = `${fileName} ${lines.slice(0, 15).join(' ')}`.toLowerCase()
  const receiptSignals = /\bsubtotal\b/.test(lower) && /\b(?:e[\s-]?wallet|cash|visa|mastercard|amex|card|thank you)\b/.test(lower)
  const documentKind = /\breceipt\b/.test(lower) || receiptSignals
    ? 'Receipt'
    : lower.includes('invoice')
      ? 'Invoice'
      : lower.includes('statement') || rows.some((row) => row.balance !== undefined)
        ? 'Statement'
        : 'Document'
  const amounts = summarizeRowAmounts(rows, documentKind, scanAmountsUnreadable)
  const receipt = documentKind === 'Receipt'
  const receiptDate = receipt
    ? lines.map((line) => extractDatesFromLine(line)[0]).find(Boolean)
    : undefined
  const receiptMerchant = receipt ? extractReceiptMerchant(lines) : undefined

  return {
    title: firstMeaningful.slice(0, 72),
    documentKind,
    total: amounts.totalDetected,
    amountStatus: amounts.amountStatus,
    vendor: receipt ? receiptMerchant : firstMeaningful,
    receiptDate,
    notes: [
      `${rows.length} structured rows detected`,
      validation.status === 'valid'
        ? `${validation.checkedRows} balance transitions validated`
        : validation.status === 'review'
          ? `${validation.issueCount} balance issue${validation.issueCount === 1 ? '' : 's'} need review`
          : 'Balance trail could not be fully validated',
      amounts.amountStatus === 'unreadable'
        ? 'Amounts not readable from the source; transaction totals are withheld'
        : totalLine ? `Total signal: ${totalLine.slice(0, 90)}` : 'No explicit total line found',
    ],
  }
}

function extractReceiptMerchant(lines: string[]) {
  const labeled = lines
    .map((line) => line.match(/^\s*(?:merchant|store|vendor|business|seller)\s*[:-]\s*(.+?)\s*$/i)?.[1])
    .find(Boolean)
  if (labeled) return labeled.slice(0, 120)

  return lines.find((line) =>
    /[a-z]/i.test(line) &&
    !datePattern.test(line) &&
    !(line.match(amountPattern)?.length) &&
    !/\b(receipt|invoice|date|time|total|subtotal|tax|paid|thank you)\b/i.test(line) &&
    !isStatementNoise(line),
  )?.trim().slice(0, 120)
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

function validateBalances(
  rows: ExtractedRow[],
  currencyCode: string,
  seeds?: { openingBalance?: number; closingBalance?: number },
): ValidationSummary {
  const issues: ValidationIssue[] = []
  const rowsWithBalances = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.balance !== undefined)
  const openingRow = rows.find((row) => /^OPENING BALANCE$/i.test(row.description))
  const closingRow = [...rows].reverse().find((row) => /^CLOSING BALANCE/i.test(row.description))
  let checkedRows = 0
  const validatedRowIndexes: number[] = []

  for (let position = 1; position < rowsWithBalances.length; position += 1) {
    const previous = rowsWithBalances[position - 1]
    const current = rowsWithBalances[position]
    const currentAmount = /^CLOSING BALANCE/i.test(current.row.description)
      ? 0
      : amountForBalanceCheck(current.row)
    const interveningTransactions = rows.slice(previous.index + 1, current.index).filter((row) => row.date)
    const interveningAmounts = interveningTransactions.map(amountForBalanceCheck)
    const amount = currentAmount !== undefined && interveningAmounts.every((value) => value !== undefined)
      ? roundMoney(currentAmount + interveningAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0))
      : undefined

    if (amount === undefined || previous.row.balance === undefined || current.row.balance === undefined) {
      if (current.row.date || interveningTransactions.length > 0) {
        issues.push({
          severity: 'warning',
          rowIndex: current.index,
          code: 'balance-step-inconsistency',
          message: 'Balance-step inconsistency: at least one parsed transaction in this balance interval has no debit/deposit amount to explain the step. Review the source; this does not establish that a row is missing.',
        })
      }
      continue
    }

    checkedRows += 1
    validatedRowIndexes.push(current.index)
    const expectedBalance = roundMoney(previous.row.balance + amount)
    const actualBalance = roundMoney(current.row.balance)
    const delta = roundMoney(actualBalance - expectedBalance)

    if (delta !== 0) {
      issues.push({
        severity: Math.abs(delta) > 1 ? 'error' : 'warning',
        code: 'balance-step-inconsistency',
        rowIndex: current.index,
        expectedBalance,
        actualBalance,
        delta,
        message: `Balance-step inconsistency: expected balance ${money(expectedBalance, currencyCode)} after net movement ${money(amount, currencyCode)} across the parsed balance interval, but found ${money(actualBalance, currencyCode)}. Review the parsed amount and both balances against the source; this is not proof of a missing row.`,
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
    openingBalance: openingRow?.balance ?? seeds?.openingBalance ?? rowsWithBalances.at(0)?.row.balance,
    closingBalance: closingRow?.balance ?? seeds?.closingBalance ?? rowsWithBalances.at(-1)?.row.balance,
    validatedRowIndexes,
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

function rowReviewStatus(validation: ValidationSummary, rowIndex: number) {
  return getRowReview(validation, rowIndex).status
}

function rowReviewNotes(validation: ValidationSummary, rowIndex: number) {
  return getRowReview(validation, rowIndex).note
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

function detectCurrencyCode(rawText: string, fileName: string) {
  const combined = `${fileName}\n${rawText}`.toLowerCase()
  if (/\bmyr\b|\brm\b/.test(combined) || combined.includes('rm ')) return 'MYR'
  if (/\bsgd\b/.test(combined) || combined.includes('s$')) return 'SGD'
  if (/\beur\b|€/.test(combined)) return 'EUR'
  if (/\bgbp\b|£/.test(combined)) return 'GBP'
  if (/\bjpy\b|¥/.test(combined)) return 'JPY'
  if (/\baud\b/.test(combined) || combined.includes('a$')) return 'AUD'
  if (/\bcad\b/.test(combined) || combined.includes('c$')) return 'CAD'
  if (/\busd\b|\$/.test(combined)) return 'USD'
  return 'USD'
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

function qboTransaction(
  row: ExtractedRow,
  index: number,
  convention: StatementDateConvention | undefined,
  validation: ValidationSummary,
) {
  if (!isTransactionRow(row)) return ''
  const posted = canonicalStatementDate(row.date, convention)?.replaceAll('-', '')
  if (!posted) return ''
  const amount = signedTransactionAmount(row)
  if (amount === undefined || !Number.isFinite(amount)) return ''

  const description = qboText(row.description || 'Transaction')
  const fitid = qboUid(`${posted}:${amount}:${description}:${index}`)
  const type = amount < 0 ? 'DEBIT' : amount > 0 ? 'CREDIT' : 'OTHER'
  const reviewStatus = getRowReview(validation, index).status
  const categoryMarker = `[ExtractMint category: ${qboText(row.category || 'Transaction').slice(0, 48)}]`
  const reviewMarker = `[ExtractMint review: ${reviewStatus}]`
  const memoSuffix = `${categoryMarker} ${reviewMarker}`
  const memo = `${description.slice(0, Math.max(0, 255 - memoSuffix.length - 1))} ${memoSuffix}`

  return [
    '<STMTTRN>',
    `<TRNTYPE>${type}`,
    `<DTPOSTED>${posted}`,
    `<TRNAMT>${qboNumber(amount)}`,
    `<FITID>${fitid}`,
    `<NAME>${description.slice(0, 32) || 'Transaction'}`,
    `<MEMO>${memo}`,
    '</STMTTRN>',
  ].join('\n')
}

function qboDateRange(
  rows: ExtractedRow[],
  period?: ConversionResult['statementPeriod'],
  convention?: StatementDateConvention,
) {
  const explicitStart = canonicalStatementDate(period?.start ?? period?.rawStart, convention)?.replaceAll('-', '')
  const explicitEnd = canonicalStatementDate(period?.end ?? period?.rawEnd, convention)?.replaceAll('-', '')

  if (period?.source === 'explicit') return { startDate: explicitStart, endDate: explicitEnd }

  const postedDates = rows
    .map((row) => canonicalStatementDate(row.date, convention)?.replaceAll('-', ''))
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
