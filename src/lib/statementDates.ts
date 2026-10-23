import type { ConversionResult } from './converter'

export type StatementDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY'

export type StatementDateConvention = {
  format?: StatementDateFormat
  source: 'document' | 'metadata' | 'user' | 'ambiguous' | 'conflict'
}

const numericDate = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g
const yearFirstDate = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g
const monthNameDate = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/gi

function normalizedYear(value: string) {
  return value.length === 2 ? `20${value}` : value
}

function validDate(yearText: string, month: number, day: number) {
  const year = Number(yearText)
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

function isoDate(year: string, month: number, day: number) {
  const normalized = normalizedYear(year)
  if (!validDate(normalized, month, day)) return undefined
  return `${normalized}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function metadataFormat(line: string): StatementDateFormat | undefined {
  if (!/(?:date|dates)\s*(?:format|order|convention)|(?:date|dates)\s*[:=]/i.test(line)) return undefined
  const text = line.toUpperCase().replace(/\s+/g, '')
  if (/DD[-/.]MM(?:[-/.]YYYY|[-/.]YY)?|\bDMY\b/.test(text)) return 'DD/MM/YYYY'
  if (/MM[-/.]DD(?:[-/.]YYYY|[-/.]YY)?|\bMDY\b/.test(text)) return 'MM/DD/YYYY'
  return undefined
}

function dateTokens(line: string) {
  const yearFirst = Array.from(line.matchAll(yearFirstDate), (match) => ({ text: match[0], index: match.index ?? 0 }))
  const numeric = Array.from(line.matchAll(numericDate), (match) => ({ text: match[0], index: match.index ?? 0 }))
  const named = Array.from(line.matchAll(monthNameDate), (match) => ({ text: match[0], index: match.index ?? 0 }))
  return [...yearFirst, ...numeric, ...named].sort((left, right) => left.index - right.index)
}

function addNumericDateEvidence(value: string | undefined, evidence: Set<StatementDateFormat>) {
  if (!value) return
  const match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (!match) return
  const first = Number(match[1])
  const second = Number(match[2])
  const year = normalizedYear(match[3])
  if (first > 12 && second <= 12 && validDate(year, second, first)) evidence.add('DD/MM/YYYY')
  if (second > 12 && first <= 12 && validDate(year, first, second)) evidence.add('MM/DD/YYYY')
}

export function detectStatementDateConvention(lines: string[], parsedRows: Array<{ date?: string }> = []): StatementDateConvention {
  const metadata = new Set<StatementDateFormat>()
  const evidence = new Set<StatementDateFormat>()

  lines.forEach((line) => {
    const explicit = metadataFormat(line)
    if (explicit) metadata.add(explicit)

    const text = line.trim()
    const printedPeriod = /(?:statement\s*(?:period|from|to)|period\s*(?:from|to)|for\s+the\s+period)/i.test(text)
    const closingBalance = /(?:closing|ending|final)\s+balance\b/i.test(text)
    if (!printedPeriod && !closingBalance) return

    dateTokens(text)
      .slice(0, printedPeriod && !closingBalance ? 2 : 1)
      .forEach(({ text: token }) => addNumericDateEvidence(token, evidence))
  })

  parsedRows.forEach((row) => addNumericDateEvidence(row.date, evidence))

  if (metadata.size > 1 || evidence.size > 1) return { source: 'conflict' }
  const metadataValue = [...metadata][0]
  const evidenceValue = [...evidence][0]
  if (metadataValue && evidenceValue && metadataValue !== evidenceValue) return { source: 'conflict' }
  if (metadataValue) return { format: metadataValue, source: 'metadata' }
  if (evidenceValue) return { format: evidenceValue, source: 'document' }
  return { source: 'ambiguous' }
}

export function canonicalStatementDate(value?: string, convention?: StatementDateConvention): string | undefined {
  const text = value?.trim()
  if (!text) return undefined

  const yearFirst = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (yearFirst) return isoDate(yearFirst[1], Number(yearFirst[2]), Number(yearFirst[3]))

  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (numeric) {
    if (convention?.source === 'conflict') return undefined
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const format = convention?.format ?? (first > 12 ? 'DD/MM/YYYY' : second > 12 ? 'MM/DD/YYYY' : undefined)
    if (!format) return undefined
    const [month, day] = format === 'DD/MM/YYYY' ? [second, first] : [first, second]
    return isoDate(numeric[3], month, day)
  }

  const named = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})$/i)
  if (!named) return undefined
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[1].slice(0, 3).toLowerCase()) + 1
  return isoDate(named[3], month, Number(named[2]))
}

export function formatStatementDate(value?: string, convention?: StatementDateConvention) {
  if (!value) return ''
  return canonicalStatementDate(value, convention) ?? value
}

export function statementPeriodLabel(
  period?: ConversionResult['statementPeriod'],
  convention?: StatementDateConvention,
) {
  const type = period?.source === 'explicit' ? 'Statement period' : 'Transaction date range'
  const start = formatStatementDate(period?.start ?? period?.rawStart, convention)
  const end = formatStatementDate(period?.end ?? period?.rawEnd, convention)
  if (!start && !end) return `${type}: —`
  return `${type}: ${start}${end && end !== start ? ` → ${end}` : ''}`
}

export function needsDateConventionChoice(
  rows: Array<{ date?: string }>,
  period: { start?: string; end?: string; rawStart?: string; rawEnd?: string } | undefined,
  convention?: StatementDateConvention,
  closingBalanceDate?: string,
) {
  if (convention?.source === 'conflict') return true
  return rows.some((row) => row.date && !canonicalStatementDate(row.date, convention)) ||
    [period?.rawStart, period?.rawEnd, closingBalanceDate].some((date) => date && !canonicalStatementDate(date, convention))
}
