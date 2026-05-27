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

function numberOrBlank(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100)
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
