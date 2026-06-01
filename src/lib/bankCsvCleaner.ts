type Delimiter = ',' | ';' | '\t'

export type BankDelimitedPreview = {
  delimiter: Delimiter
  rows: string[][]
  headerIndex: number
  headers: string[]
  dataRows: string[][]
}

export type BankCsvCleanerMapping = {
  date: number
  description?: number
  reference?: number
  withdrawal?: number
  deposit?: number
  amount?: number
  balance?: number
}

export type BankSpreadsheetPreview = {
  sheetNames: string[]
  activeSheet: string
  text: string
  stats: { rowsRead: number; truncated: boolean }
}

export type QuickBooksBankCsvDateFormat = 'dmy' | 'mdy'

const datePattern =
  /(?:\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b)/i

function countUnquotedDelimiters(line: string, delimiter: Delimiter) {
  let inQuotes = false
  let count = 0
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const next = line[index + 1]
      if (inQuotes && next === '"') {
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === delimiter) count += 1
  }
  return count
}

function splitDelimitedLine(line: string, delimiter: Delimiter) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const next = line[index + 1]
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

function guessDelimiter(lines: string[]): Delimiter {
  const candidates: Delimiter[] = [',', ';', '\t']
  let best: Delimiter = ','
  let bestScore = -1
  for (const delimiter of candidates) {
    const score = lines.reduce((sum, line) => sum + countUnquotedDelimiters(line, delimiter), 0)
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

function normalizeHeaderCell(value: string) {
  return (value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function clampText(value: string, maxLength: number) {
  const text = (value ?? '').trim().replace(/\s+/g, ' ')
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim()
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text: unknown }).text)
  }
  if (typeof value === 'object' && value && 'result' in value) {
    return String((value as { result: unknown }).result)
  }
  return String(value)
}

function parseMoney(value: string) {
  const raw = (value ?? '').trim()
  if (!raw) return undefined

  let negative = false
  let normalized = raw
  if (normalized.startsWith('(') && normalized.endsWith(')')) {
    negative = true
    normalized = normalized.slice(1, -1)
  }

  normalized = normalized
    .replace(/[^\d,.-]/g, '')
    .replace(/,/g, '')
    .trim()

  if (!normalized) return undefined
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return undefined
  return negative ? -Math.abs(parsed) : parsed
}

function formatDateForTable(raw: string) {
  const value = (raw ?? '').trim()
  if (!value) return ''

  const numeric = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (numeric) {
    const first = numeric[1]
    const second = numeric[2]
    const year = numeric[3]?.length === 2 ? `20${numeric[3]}` : numeric[3]
    return `${first}/${second}/${year}`
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!iso) return value
  return `${Number(iso[3])}/${Number(iso[2])}/${iso[1]}`
}

function normalizeQuickBooksBankDate(raw: string, dateFormat: QuickBooksBankCsvDateFormat) {
  const value = (raw ?? '').trim()
  if (!value) return ''

  const numeric = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (numeric) {
    const first = Number.parseInt(numeric[1], 10)
    const second = Number.parseInt(numeric[2], 10)
    const year = numeric[3]?.length === 2 ? Number.parseInt(`20${numeric[3]}`, 10) : Number.parseInt(numeric[3], 10)
    if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(year)) return value
    const mm = dateFormat === 'mdy' ? first : second
    const dd = dateFormat === 'mdy' ? second : first
    return `${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}/${String(year).padStart(4, '0')}`
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const year = iso[1]
    const month = iso[2]
    const day = iso[3]
    return dateFormat === 'mdy' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`
  }

  return value
}

function normalizeBankDate(raw: string, dateFormat: QuickBooksBankCsvDateFormat) {
  return normalizeQuickBooksBankDate(raw, dateFormat)
}

function numberOrBlank(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100)
}

function escapeCsvCell(value: string) {
  const text = (value ?? '').trim()
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function parseBankDelimitedText(raw: string, options: { headerIndex?: number } = {}): BankDelimitedPreview | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) return null

  const delimiter = guessDelimiter(lines.slice(0, 20))
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter)).filter((row) => row.some((cell) => (cell ?? '').trim()))
  if (rows.length === 0) return null

  const headerIndex = Math.max(0, Math.min(options.headerIndex ?? 0, Math.max(0, rows.length - 1)))
  const headerRow = rows[headerIndex] ?? []
  const headers = headerRow.map((cell, index) => normalizeHeaderCell(cell) || `column ${index + 1}`)

  return {
    delimiter,
    rows,
    headerIndex,
    headers,
    dataRows: rows.slice(headerIndex + 1),
  }
}

export async function parseBankSpreadsheetFile(
  file: File,
  options: { sheetName?: string; maxRows?: number } = {},
): Promise<BankSpreadsheetPreview> {
  const maxRows = Math.max(1, options.maxRows ?? 5000)
  const ExcelJS = await import('exceljs')
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheetNames = workbook.worksheets.map((sheet) => sheet.name).filter(Boolean)
  const activeSheet = options.sheetName && sheetNames.includes(options.sheetName) ? options.sheetName : (sheetNames[0] ?? 'Sheet1')
  const sheet = workbook.getWorksheet(activeSheet) ?? workbook.worksheets[0]

  const lines: string[] = []
  let rowsRead = 0
  let truncated = false

  sheet?.eachRow((row) => {
    if (rowsRead >= maxRows) {
      truncated = true
      return
    }
    rowsRead += 1
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    const cells = values.map(cellToText).map((cell) => {
      const trimmed = (cell ?? '').trim()
      if (!trimmed) return ''
      if (trimmed.match(datePattern)) return formatDateForTable(trimmed)
      return trimmed
    })
    lines.push(cells.join('\t'))
  })

  return {
    sheetNames,
    activeSheet,
    text: lines.join('\n'),
    stats: { rowsRead, truncated },
  }
}

export function buildExtractMintCleanedTable(preview: BankDelimitedPreview, mapping: BankCsvCleanerMapping) {
  const output: string[] = []
  output.push(['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'].join('\t'))

  let written = 0
  let skippedNoDate = 0

  for (const row of preview.dataRows) {
    const dateRaw = row[mapping.date] ?? ''
    const date = formatDateForTable(dateRaw)
    if (!date) {
      skippedNoDate += 1
      continue
    }

    const description = clampText(mapping.description !== undefined ? (row[mapping.description] ?? '') : '', 220) || 'Transaction'
    const reference = clampText(mapping.reference !== undefined ? (row[mapping.reference] ?? '') : '', 80)

    const withdrawalRaw = mapping.withdrawal !== undefined ? parseMoney(row[mapping.withdrawal] ?? '') : undefined
    const depositRaw = mapping.deposit !== undefined ? parseMoney(row[mapping.deposit] ?? '') : undefined
    const amountRaw = mapping.amount !== undefined ? parseMoney(row[mapping.amount] ?? '') : undefined
    const balance = mapping.balance !== undefined ? parseMoney(row[mapping.balance] ?? '') : undefined

    const normalizedWithdrawal =
      withdrawalRaw !== undefined
        ? Math.abs(withdrawalRaw)
        : amountRaw !== undefined && amountRaw < 0
          ? Math.abs(amountRaw)
          : undefined
    const normalizedDeposit =
      depositRaw !== undefined
        ? Math.abs(depositRaw)
        : amountRaw !== undefined && amountRaw > 0
          ? Math.abs(amountRaw)
          : undefined

    output.push(
      [date, description, reference, numberOrBlank(normalizedWithdrawal), numberOrBlank(normalizedDeposit), '', numberOrBlank(balance)].join('\t'),
    )
    written += 1
  }

  return {
    text: output.join('\n'),
    stats: { written, skippedNoDate },
  }
}

export type BankCsvCleanerValidationPack = {
  schema: 'extractmint.bankCsvCleaner.validationPack.v1'
  generatedAt: string
  stats: {
    inputRows: number
    written: number
    skippedNoDate: number
  }
  balanceTrail?: {
    available: boolean
    checked: number
    mismatches: number
    unknownNet: number
    missingBalance: number
    invalidBalance: number
    examples: Array<{
      rowNumber: number
      date: string
      description: string
      previousBalance: number
      expectedBalance: number
      actualBalance: number
      delta: number
    }>
  }
}

export function buildBankCsvCleanerValidationPack(preview: BankDelimitedPreview, mapping: BankCsvCleanerMapping): BankCsvCleanerValidationPack {
  const inputRows = preview.dataRows.length

  let written = 0
  let skippedNoDate = 0

  const hasBalance = mapping.balance !== undefined
  let checked = 0
  let mismatches = 0
  let unknownNet = 0
  let missingBalance = 0
  let invalidBalance = 0
  const examples: Array<{
    rowNumber: number
    date: string
    description: string
    previousBalance: number
    expectedBalance: number
    actualBalance: number
    delta: number
  }> = []

  let previousBalance: number | undefined

  for (let index = 0; index < preview.dataRows.length; index += 1) {
    const row = preview.dataRows[index]

    const dateRaw = row[mapping.date] ?? ''
    const date = formatDateForTable(dateRaw)
    if (!date) {
      skippedNoDate += 1
      continue
    }

    const description = clampText(mapping.description !== undefined ? (row[mapping.description] ?? '') : '', 220) || 'Transaction'

    const withdrawalRaw = mapping.withdrawal !== undefined ? (row[mapping.withdrawal] ?? '') : ''
    const depositRaw = mapping.deposit !== undefined ? (row[mapping.deposit] ?? '') : ''
    const amountRaw = mapping.amount !== undefined ? (row[mapping.amount] ?? '') : ''
    const balanceRaw = mapping.balance !== undefined ? (row[mapping.balance] ?? '') : ''

    const withdrawalParsed = mapping.withdrawal !== undefined ? parseMoney(withdrawalRaw) : undefined
    const depositParsed = mapping.deposit !== undefined ? parseMoney(depositRaw) : undefined
    const amountParsed = mapping.amount !== undefined ? parseMoney(amountRaw) : undefined
    const balanceParsed = mapping.balance !== undefined ? parseMoney(balanceRaw) : undefined

    const normalizedWithdrawal =
      withdrawalParsed !== undefined
        ? Math.abs(withdrawalParsed)
        : amountParsed !== undefined && amountParsed < 0
          ? Math.abs(amountParsed)
          : undefined
    const normalizedDeposit =
      depositParsed !== undefined
        ? Math.abs(depositParsed)
        : amountParsed !== undefined && amountParsed > 0
          ? Math.abs(amountParsed)
          : undefined

    written += 1

    if (!hasBalance) continue

    const balanceRawTrimmed = balanceRaw.trim()
    if (!balanceRawTrimmed) {
      missingBalance += 1
      previousBalance = undefined
      continue
    }

    if (balanceParsed === undefined) {
      invalidBalance += 1
      previousBalance = undefined
      continue
    }

    if (previousBalance === undefined) {
      previousBalance = balanceParsed
      continue
    }

    const net =
      normalizedDeposit !== undefined || normalizedWithdrawal !== undefined
        ? (normalizedDeposit ?? 0) - (normalizedWithdrawal ?? 0)
        : undefined
    if (net === undefined || !Number.isFinite(net)) {
      unknownNet += 1
      previousBalance = balanceParsed
      continue
    }

    const expected = Math.round((previousBalance + net) * 100) / 100
    const actual = Math.round(balanceParsed * 100) / 100
    const delta = Math.round((actual - expected) * 100) / 100

    checked += 1
    if (Math.abs(delta) > 0.01) {
      mismatches += 1
      if (examples.length < 8) {
        examples.push({
          rowNumber: preview.headerIndex + 2 + index,
          date,
          description,
          previousBalance: Math.round(previousBalance * 100) / 100,
          expectedBalance: expected,
          actualBalance: actual,
          delta,
        })
      }
    }

    previousBalance = balanceParsed
  }

  return {
    schema: 'extractmint.bankCsvCleaner.validationPack.v1',
    generatedAt: new Date().toISOString(),
    stats: { inputRows, written, skippedNoDate },
    balanceTrail: hasBalance
      ? { available: true, checked, mismatches, unknownNet, missingBalance, invalidBalance, examples }
      : undefined,
  }
}

export function buildQuickBooksBankCsv(preview: BankDelimitedPreview, mapping: BankCsvCleanerMapping, options: { dateFormat: QuickBooksBankCsvDateFormat }) {
  const output: string[] = []
  output.push('Date,Description,Amount')

  let written = 0
  let skippedNoDate = 0
  let skippedNoAmount = 0
  let skippedZeroAmount = 0

  for (const row of preview.dataRows) {
    const dateRaw = row[mapping.date] ?? ''
    const date = normalizeBankDate(dateRaw, options.dateFormat)
    if (!date) {
      skippedNoDate += 1
      continue
    }

    const description = clampText(mapping.description !== undefined ? (row[mapping.description] ?? '') : '', 220) || 'Transaction'

    const amountRaw = mapping.amount !== undefined ? parseMoney(row[mapping.amount] ?? '') : undefined
    const withdrawalRaw = mapping.withdrawal !== undefined ? parseMoney(row[mapping.withdrawal] ?? '') : undefined
    const depositRaw = mapping.deposit !== undefined ? parseMoney(row[mapping.deposit] ?? '') : undefined

    const withdrawal = withdrawalRaw !== undefined ? Math.abs(withdrawalRaw) : undefined
    const deposit = depositRaw !== undefined ? Math.abs(depositRaw) : undefined
    const derivedAmount =
      amountRaw !== undefined
        ? amountRaw
        : deposit !== undefined || withdrawal !== undefined
          ? (deposit ?? 0) - (withdrawal ?? 0)
          : undefined

    if (derivedAmount === undefined || !Number.isFinite(derivedAmount)) {
      skippedNoAmount += 1
      continue
    }
    const rounded = Math.round(derivedAmount * 100) / 100
    if (Math.abs(rounded) < 0.0001) {
      skippedZeroAmount += 1
      continue
    }

    output.push(`${escapeCsvCell(date)},${escapeCsvCell(description)},${rounded}`)
    written += 1
  }

  return {
    text: output.join('\n') + '\n',
    stats: { written, skippedNoDate, skippedNoAmount, skippedZeroAmount },
  }
}

export function buildQuickBooksBankCsvCreditDebit(
  preview: BankDelimitedPreview,
  mapping: BankCsvCleanerMapping,
  options: { dateFormat: QuickBooksBankCsvDateFormat },
) {
  const output: string[] = []
  output.push('Date,Description,Credit,Debit')

  let written = 0
  let skippedNoDate = 0
  let skippedNoAmount = 0
  let skippedZeroAmount = 0

  for (const row of preview.dataRows) {
    const dateRaw = row[mapping.date] ?? ''
    const date = normalizeBankDate(dateRaw, options.dateFormat)
    if (!date) {
      skippedNoDate += 1
      continue
    }

    const description = clampText(mapping.description !== undefined ? (row[mapping.description] ?? '') : '', 220) || 'Transaction'

    const amountRaw = mapping.amount !== undefined ? parseMoney(row[mapping.amount] ?? '') : undefined
    const withdrawalRaw = mapping.withdrawal !== undefined ? parseMoney(row[mapping.withdrawal] ?? '') : undefined
    const depositRaw = mapping.deposit !== undefined ? parseMoney(row[mapping.deposit] ?? '') : undefined

    const withdrawal = withdrawalRaw !== undefined ? Math.abs(withdrawalRaw) : undefined
    const deposit = depositRaw !== undefined ? Math.abs(depositRaw) : undefined
    const derivedAmount =
      amountRaw !== undefined
        ? amountRaw
        : deposit !== undefined || withdrawal !== undefined
          ? (deposit ?? 0) - (withdrawal ?? 0)
          : undefined

    if (derivedAmount === undefined || !Number.isFinite(derivedAmount)) {
      skippedNoAmount += 1
      continue
    }
    const rounded = Math.round(derivedAmount * 100) / 100
    if (Math.abs(rounded) < 0.0001) {
      skippedZeroAmount += 1
      continue
    }

    const credit = rounded > 0 ? Math.abs(rounded) : ''
    const debit = rounded < 0 ? Math.abs(rounded) : ''
    output.push(`${escapeCsvCell(date)},${escapeCsvCell(description)},${credit},${debit}`)
    written += 1
  }

  return {
    text: output.join('\n') + '\n',
    stats: { written, skippedNoDate, skippedNoAmount, skippedZeroAmount },
  }
}

export function buildXeroBankCsv(preview: BankDelimitedPreview, mapping: BankCsvCleanerMapping, options: { dateFormat: QuickBooksBankCsvDateFormat }) {
  const output: string[] = []
  output.push('Date,Amount,Description,Reference')

  let written = 0
  let skippedNoDate = 0
  let skippedNoAmount = 0
  let skippedZeroAmount = 0

  for (const row of preview.dataRows) {
    const dateRaw = row[mapping.date] ?? ''
    const date = normalizeBankDate(dateRaw, options.dateFormat)
    if (!date) {
      skippedNoDate += 1
      continue
    }

    const description = clampText(mapping.description !== undefined ? (row[mapping.description] ?? '') : '', 220) || 'Transaction'
    const reference = clampText(mapping.reference !== undefined ? (row[mapping.reference] ?? '') : '', 80)

    const amountRaw = mapping.amount !== undefined ? parseMoney(row[mapping.amount] ?? '') : undefined
    const withdrawalRaw = mapping.withdrawal !== undefined ? parseMoney(row[mapping.withdrawal] ?? '') : undefined
    const depositRaw = mapping.deposit !== undefined ? parseMoney(row[mapping.deposit] ?? '') : undefined

    const withdrawal = withdrawalRaw !== undefined ? Math.abs(withdrawalRaw) : undefined
    const deposit = depositRaw !== undefined ? Math.abs(depositRaw) : undefined
    const derivedAmount =
      amountRaw !== undefined
        ? amountRaw
        : deposit !== undefined || withdrawal !== undefined
          ? (deposit ?? 0) - (withdrawal ?? 0)
          : undefined

    if (derivedAmount === undefined || !Number.isFinite(derivedAmount)) {
      skippedNoAmount += 1
      continue
    }
    const rounded = Math.round(derivedAmount * 100) / 100
    if (Math.abs(rounded) < 0.0001) {
      skippedZeroAmount += 1
      continue
    }

    output.push(`${escapeCsvCell(date)},${rounded},${escapeCsvCell(description)},${escapeCsvCell(reference)}`)
    written += 1
  }

  return {
    text: output.join('\n') + '\n',
    stats: { written, skippedNoDate, skippedNoAmount, skippedZeroAmount },
  }
}
