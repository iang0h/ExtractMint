import type { ConversionResult, ExtractedRow, ValidationSummary } from './converter'
import { lowerRowConfidence } from './reviewStatus'
import type { StatementDateConvention } from './statementDates'

export type EditableRowField = 'date' | 'description' | 'reference' | 'withdrawal' | 'deposit' | 'amount' | 'balance'

type RowEditorConverter = {
  revalidateRows: (
    rows: ExtractedRow[],
    currencyCode: string,
    seeds?: { openingBalance?: number; closingBalance?: number },
  ) => ValidationSummary
  refreshStatementPeriod: (
    rows: ExtractedRow[],
    previous?: ConversionResult['statementPeriod'],
    convention?: StatementDateConvention,
  ) => ConversionResult['statementPeriod']
}

export function applyRowEdit(row: ExtractedRow, field: EditableRowField, rawValue: string): ExtractedRow {
  const next = { ...row, edited: true }
  if (field === 'date') {
    next.date = rawValue.trim() || undefined
    next.confidence = next.date ? 100 : 45
    return next
  }
  if (field === 'description') {
    next.description = rawValue.trim() || row.description
    return next
  }
  if (field === 'reference') {
    next.reference = rawValue.trim() || undefined
    return next
  }

  if (field === 'withdrawal' && rawValue.trim() === '' && row.withdrawal === undefined) {
    clearInvalidEdit(next, field)
    return next
  }
  if (field === 'deposit' && rawValue.trim() === '' && row.deposit === undefined) {
    clearInvalidEdit(next, field)
    return next
  }

  const parsed = parseMoneyInput(rawValue)
  if (parsed === undefined && rawValue.trim() !== '') {
    next.invalidEdits = { ...row.invalidEdits, [field]: rawValue }
    next.confidence = 45
    return next
  }
  clearInvalidEdit(next, field)
  next.confidence = parsed === undefined ? 45 : 100
  if (field === 'withdrawal') {
    next.withdrawal = parsed === undefined ? undefined : Math.abs(parsed)
    next.deposit = undefined
    next.amount = parsed === undefined ? undefined : -Math.abs(parsed)
    next.category = parsed === undefined ? 'Transaction' : 'Withdrawal'
  } else if (field === 'deposit') {
    next.deposit = parsed === undefined ? undefined : Math.abs(parsed)
    next.withdrawal = undefined
    next.amount = parsed === undefined ? undefined : Math.abs(parsed)
    next.category = parsed === undefined ? 'Transaction' : 'Deposit'
  } else if (field === 'amount') {
    next.amount = parsed
    next.withdrawal = parsed !== undefined && parsed < 0 ? Math.abs(parsed) : undefined
    next.deposit = parsed !== undefined && parsed > 0 ? parsed : undefined
    next.category = parsed === undefined || parsed === 0 ? 'Transaction' : parsed < 0 ? 'Withdrawal' : 'Deposit'
  } else if (field === 'balance') {
    next.balance = parsed
  }
  return next
}

export function updateConversionRow(
  result: ConversionResult,
  rowIndex: number,
  field: EditableRowField,
  rawValue: string,
  converter?: RowEditorConverter,
): ConversionResult {
  const original = result.rows[rowIndex]
  if (!original) return result

  const rows = [...result.rows]
  rows[rowIndex] = applyRowEdit(original, field, rawValue)
  let validation = result.validation

  if (converter) {
    const lastBalanceIndex = rows.reduce((last, row, index) => row.balance !== undefined ? index : last, -1)
    const seeds = {
      openingBalance: result.validation.openingBalance,
      closingBalance:
        field === 'balance' && rowIndex === lastBalanceIndex
          ? rows[rowIndex].balance
          : result.validation.closingBalance,
    }
    validation = converter.revalidateRows(rows, result.currencyCode || 'USD', seeds)
    const fileIssues = result.validation.issues.filter((issue) => issue.rowIndex === undefined)
    if (fileIssues.length > 0) {
      const issueKeys = new Set(validation.issues.map(issueKey))
      validation.issues = [
        ...validation.issues,
        ...fileIssues.filter((issue) => !issueKeys.has(issueKey(issue))),
      ]
      validation.issueCount = validation.issues.length
      if (fileIssues.some((issue) => issue.severity !== 'info')) validation.status = 'review'
    }
  }

  const invalidEditIssues = rows.flatMap((row, index) =>
    Object.keys(row.invalidEdits ?? {}).map((field) => ({
      severity: 'error' as const,
      code: 'invalid-row-edit' as const,
      rowIndex: index,
      message: `The ${field} value could not be read. Enter a valid amount before exporting.`,
    })),
  )
  validation = {
    ...validation,
    issues: [
      ...validation.issues.filter((issue) => issue.code !== 'invalid-row-edit'),
      ...invalidEditIssues,
    ],
  }
  validation.issueCount = validation.issues.length
  if (invalidEditIssues.length > 0) validation.status = 'review'

  const reviewedRows = lowerRowConfidence(rows, validation)
  const total = roundMoney(reviewedRows.reduce((sum, row) => sum + Math.abs(row.amount ?? row.deposit ?? row.withdrawal ?? 0), 0))
  const averageConfidence = reviewedRows.length === 0
    ? 0
    : Math.round(reviewedRows.reduce((sum, row) => sum + row.confidence, 0) / reviewedRows.length)
  const confidence = validation.status === 'valid' ? averageConfidence : Math.min(68, averageConfidence)

  return {
    ...result,
    rows: reviewedRows,
    validation,
    confidence,
    summary: {
      ...result.summary,
      total,
      notes: result.summary.notes.map((note, index) =>
        index === 0 ? `${reviewedRows.filter((row) => row.amount !== undefined).length} structured rows detected` : note,
      ),
    },
    statementPeriod: converter
      ? converter.refreshStatementPeriod(reviewedRows, result.statementPeriod, result.dateConvention)
      : result.statementPeriod,
  }
}

function parseMoneyInput(value: string) {
  const text = value.trim()
  if (!text) return undefined
  const isParenthesized = text.startsWith('(') && text.endsWith(')')
  if ((text.includes('(') || text.includes(')')) && !isParenthesized) return undefined

  let numericText = isParenthesized ? text.slice(1, -1).trim() : text
  const sign = numericText.match(/^([+-])/)
  if (isParenthesized && sign) return undefined
  const isNegative = isParenthesized || sign?.[1] === '-'
  if (sign) numericText = numericText.slice(1).trim()
  numericText = numericText
    .replace(/^(?:[$€£¥]|[A-Z]{3}\s*|RM\s*)/i, '')
    .replace(/\s*(?:[A-Z]{3}|RM)$/i, '')
    .trim()
  const validNumber = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?$|^\.\d+$/
  if (!validNumber.test(numericText)) return undefined
  const numeric = Number(numericText.replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return undefined
  return isNegative ? -numeric : numeric
}

function clearInvalidEdit(row: ExtractedRow, field: EditableRowField) {
  if (!row.invalidEdits || !(field in row.invalidEdits)) return
  const invalidEdits = { ...row.invalidEdits }
  delete invalidEdits[field as keyof typeof invalidEdits]
  row.invalidEdits = invalidEdits
}

function issueKey(issue: ValidationSummary['issues'][number]) {
  return `${issue.rowIndex ?? 'file'}\u0000${issue.severity}\u0000${issue.message}`
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
