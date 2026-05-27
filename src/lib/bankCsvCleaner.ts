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
    .map((line) => line.trim())
    .filter(Boolean)

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
