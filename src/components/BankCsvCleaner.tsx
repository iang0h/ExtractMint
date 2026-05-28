import { FileSpreadsheet, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { BankCsvCleanerMapping } from '../lib/bankCsvCleaner'
import {
  buildExtractMintCleanedTable,
  buildQuickBooksBankCsv,
  buildQuickBooksBankCsvCreditDebit,
  buildXeroBankCsv,
  type QuickBooksBankCsvDateFormat,
  parseBankDelimitedText,
  parseBankSpreadsheetFile,
} from '../lib/bankCsvCleaner'

type Props = {
  onConvertCleanedFile: (file: File) => void
  quickBooksDateFormat: QuickBooksBankCsvDateFormat
}

const defaultHeaderIndices = Array.from({ length: 12 }, (_, index) => index)

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function BankCsvCleaner(props: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rawText, setRawText] = useState<string>('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheetName, setSheetName] = useState<string>('')
  const [loadedSheetName, setLoadedSheetName] = useState<string>('')
  const [sheetStats, setSheetStats] = useState<{ rowsRead: number; truncated: boolean } | null>(null)
  const [headerIndex, setHeaderIndex] = useState<number>(0)
  const [mapping, setMapping] = useState<Partial<BankCsvCleanerMapping>>({})
  const [error, setError] = useState<string>('')
  const [isTemplatesOpen, setIsTemplatesOpen] = useState<boolean>(false)
  const [dateFormatOverride, setDateFormatOverride] = useState<'auto' | QuickBooksBankCsvDateFormat>('auto')
  const [quickBooksChunkStart, setQuickBooksChunkStart] = useState<number>(1)
  const [quickBooksChunkEnd, setQuickBooksChunkEnd] = useState<number>(1000)
  const [lastStats, setLastStats] = useState<
    | null
    | {
        kind: 'extractmint' | 'quickbooks' | 'quickbooks-credit-debit' | 'xero'
        written: number
        skippedNoDate: number
        skippedNoAmount?: number
        skippedZeroAmount?: number
      }
  >(null)

  const isWorkbook = file ? ['xlsx', 'xls'].includes(extensionOf(file.name)) : false
  const resolvedDateFormat = dateFormatOverride === 'auto' ? props.quickBooksDateFormat : dateFormatOverride
  const exampleDate = resolvedDateFormat === 'dmy' ? '31/01/2026' : '01/31/2026'

  useEffect(() => {
    if (!file) return
    if (!isWorkbook) return

    let cancelled = false
    void (async () => {
      try {
        const parsed = await parseBankSpreadsheetFile(file, { maxRows: 5000 })
        if (cancelled) return
        setSheetNames(parsed.sheetNames)
        setSheetName(parsed.activeSheet)
        setLoadedSheetName(parsed.activeSheet)
        setSheetStats(parsed.stats)
        setRawText(parsed.text)
      } catch (readError) {
        if (cancelled) return
        setError(readError instanceof Error ? readError.message : 'Failed to read spreadsheet')
        setSheetNames([])
        setSheetName('')
        setLoadedSheetName('')
        setSheetStats(null)
        setRawText('')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, isWorkbook])

  useEffect(() => {
    if (!file) return
    if (!isWorkbook) return
    if (!sheetName) return
    if (sheetName === loadedSheetName) return

    let cancelled = false
    void (async () => {
      try {
        const parsed = await parseBankSpreadsheetFile(file, { sheetName, maxRows: 5000 })
        if (cancelled) return
        setSheetStats(parsed.stats)
        setLoadedSheetName(parsed.activeSheet)
        setRawText(parsed.text)
      } catch (readError) {
        if (cancelled) return
        setError(readError instanceof Error ? readError.message : 'Failed to read spreadsheet')
        setSheetStats(null)
        setRawText('')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, isWorkbook, sheetName, loadedSheetName])

  const preview = useMemo(() => {
    if (!rawText) return null
    return parseBankDelimitedText(rawText, { headerIndex })
  }, [rawText, headerIndex])

  const columnOptions = useMemo(() => {
    const headers = preview?.headers ?? []
    return headers.map((label, index) => ({ label: label || `Column ${index + 1}`, index }))
  }, [preview])

  const cleanedPreviewRows = useMemo(() => {
    if (!preview) return []
    if (mapping.date === undefined) return []
    const built = buildExtractMintCleanedTable(preview, mapping as BankCsvCleanerMapping)
    return built.text.split('\n').slice(0, 7)
  }, [preview, mapping])

  const dateFormatDetection = useMemo(() => {
    if (!preview) return null
    if (mapping.date === undefined) return null

    let sampled = 0
    let dmyHints = 0
    let mdyHints = 0

    for (const row of preview.dataRows) {
      if (sampled >= 250) break
      const raw = (row[mapping.date] ?? '').trim()
      if (!raw) continue
      const match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
      if (!match) continue

      sampled += 1
      const first = Number.parseInt(match[1], 10)
      const second = Number.parseInt(match[2], 10)
      if (!Number.isFinite(first) || !Number.isFinite(second)) continue
      if (first > 12 && second <= 12) dmyHints += 1
      if (second > 12 && first <= 12) mdyHints += 1
    }

    const format: QuickBooksBankCsvDateFormat | null = dmyHints > mdyHints ? 'dmy' : mdyHints > dmyHints ? 'mdy' : null
    return { sampled, dmyHints, mdyHints, format }
  }, [preview, mapping.date])

  const canBuild = Boolean(preview && file && mapping.date !== undefined)

  const quickBooksChunk = useMemo(() => {
    if (!preview) return null
    const rowCount = preview.dataRows.length
    if (!rowCount) return null

    const start = Number.isFinite(quickBooksChunkStart) ? Math.max(1, Math.floor(quickBooksChunkStart)) : 1
    const end = Number.isFinite(quickBooksChunkEnd) ? Math.min(rowCount, Math.floor(quickBooksChunkEnd)) : Math.min(1000, rowCount)
    const clampedEnd = Math.max(start, end)
    const dataRows = preview.dataRows.slice(start - 1, clampedEnd)
    return { start, end: clampedEnd, rowCount, preview: { ...preview, dataRows } }
  }, [preview, quickBooksChunkStart, quickBooksChunkEnd])

  const downloadQuickBooksCsv = () => {
    if (!preview || !file || mapping.date === undefined) return
    setError('')
    try {
      const built = buildQuickBooksBankCsv(preview, mapping as BankCsvCleanerMapping, { dateFormat: resolvedDateFormat })
      setLastStats({
        kind: 'quickbooks',
        written: built.stats.written,
        skippedNoDate: built.stats.skippedNoDate,
        skippedNoAmount: built.stats.skippedNoAmount,
        skippedZeroAmount: built.stats.skippedZeroAmount,
      })
      const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.quickbooks-bank.${resolvedDateFormat}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build QuickBooks CSV')
    }
  }

  const downloadQuickBooksChunkCsv = () => {
    if (!quickBooksChunk || !file || mapping.date === undefined) return
    setError('')
    try {
      const built = buildQuickBooksBankCsv(quickBooksChunk.preview, mapping as BankCsvCleanerMapping, { dateFormat: resolvedDateFormat })
      setLastStats({
        kind: 'quickbooks',
        written: built.stats.written,
        skippedNoDate: built.stats.skippedNoDate,
        skippedNoAmount: built.stats.skippedNoAmount,
        skippedZeroAmount: built.stats.skippedZeroAmount,
      })
      const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.quickbooks-bank.${resolvedDateFormat}.rows-${quickBooksChunk.start}-${quickBooksChunk.end}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build QuickBooks CSV')
    }
  }

  const downloadXeroCsv = () => {
    if (!preview || !file || mapping.date === undefined) return
    setError('')
    try {
      const built = buildXeroBankCsv(preview, mapping as BankCsvCleanerMapping, { dateFormat: resolvedDateFormat })
      setLastStats({
        kind: 'xero',
        written: built.stats.written,
        skippedNoDate: built.stats.skippedNoDate,
        skippedNoAmount: built.stats.skippedNoAmount,
        skippedZeroAmount: built.stats.skippedZeroAmount,
      })
      const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.xero-bank.${resolvedDateFormat}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build Xero CSV')
    }
  }

  const downloadQuickBooksCreditDebitCsv = () => {
    if (!preview || !file || mapping.date === undefined) return
    setError('')
    try {
      const built = buildQuickBooksBankCsvCreditDebit(preview, mapping as BankCsvCleanerMapping, { dateFormat: resolvedDateFormat })
      setLastStats({
        kind: 'quickbooks-credit-debit',
        written: built.stats.written,
        skippedNoDate: built.stats.skippedNoDate,
        skippedNoAmount: built.stats.skippedNoAmount,
        skippedZeroAmount: built.stats.skippedZeroAmount,
      })
      const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.quickbooks-bank.credit-debit.${resolvedDateFormat}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build QuickBooks Credit/Debit CSV')
    }
  }

  const downloadQuickBooksChunkCreditDebitCsv = () => {
    if (!quickBooksChunk || !file || mapping.date === undefined) return
    setError('')
    try {
      const built = buildQuickBooksBankCsvCreditDebit(quickBooksChunk.preview, mapping as BankCsvCleanerMapping, { dateFormat: resolvedDateFormat })
      setLastStats({
        kind: 'quickbooks-credit-debit',
        written: built.stats.written,
        skippedNoDate: built.stats.skippedNoDate,
        skippedNoAmount: built.stats.skippedNoAmount,
        skippedZeroAmount: built.stats.skippedZeroAmount,
      })
      const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.quickbooks-bank.credit-debit.${resolvedDateFormat}.rows-${quickBooksChunk.start}-${quickBooksChunk.end}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build QuickBooks Credit/Debit CSV')
    }
  }

  const downloadTemplate = (filename: string, csv: string) => {
    setError('')
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Failed to download template')
    }
  }

  return (
    <details className="csv-cleaner-panel">
      <summary>
        <span className="csv-cleaner-title">
          <Wand2 size={16} />
          Bank CSV cleaner (manual mapping)
        </span>
        <span className="csv-cleaner-subtitle">Fix messy exports when auto-detection fails</span>
      </summary>
      <div className="csv-cleaner-body">
        <p>
          Upload a bank-export <strong>.csv</strong> or <strong>.xlsx</strong>, map columns, and generate a cleaned ExtractMint table (local-only).
          Then click “Convert cleaned file”.
        </p>

        <div className="csv-cleaner-grid">
          <label className="csv-cleaner-file">
            <span>Bank export</span>
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null
                setError('')
                setLastStats(null)
                setMapping({})
                setHeaderIndex(0)
                setQuickBooksChunkStart(1)
                setQuickBooksChunkEnd(1000)
                setFile(next)
                setSheetNames([])
                setSheetName('')
                setLoadedSheetName('')
                setSheetStats(null)
                if (!next) {
                  setRawText('')
                  return
                }
                const extension = extensionOf(next.name)
                if (['xlsx', 'xls'].includes(extension)) return
                void (async () => {
                  try {
                    const text = await next.text()
                    setRawText(text)
                  } catch (readError) {
                    setError(readError instanceof Error ? readError.message : 'Failed to read file')
                    setRawText('')
                  }
                })()
              }}
            />
          </label>

          {isWorkbook && sheetNames.length > 1 ? (
            <label>
              <span>Sheet</span>
              <select
                value={sheetName}
                onChange={(event) => {
                  setSheetName(event.target.value)
                }}
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            <span>Header row</span>
            <select
              value={String(headerIndex)}
              disabled={!preview}
              onChange={(event) => {
                setQuickBooksChunkStart(1)
                setQuickBooksChunkEnd(1000)
                setHeaderIndex(Number.parseInt(event.target.value, 10) || 0)
              }}
            >
              {defaultHeaderIndices.map((index) => (
                <option key={index} value={String(index)}>
                  Row {index + 1}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Date (required)</span>
            <select
              value={mapping.date === undefined ? '' : String(mapping.date)}
              disabled={!preview}
              onChange={(event) => setMapping((previous) => ({ ...previous, date: Number.parseInt(event.target.value, 10) }))}
            >
              <option value="">Select…</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Description</span>
            <select
              value={mapping.description === undefined ? '' : String(mapping.description)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  description: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Reference</span>
            <select
              value={mapping.reference === undefined ? '' : String(mapping.reference)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  reference: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Withdrawal</span>
            <select
              value={mapping.withdrawal === undefined ? '' : String(mapping.withdrawal)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  withdrawal: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Deposit</span>
            <select
              value={mapping.deposit === undefined ? '' : String(mapping.deposit)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  deposit: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Amount (optional)</span>
            <select
              value={mapping.amount === undefined ? '' : String(mapping.amount)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  amount: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Balance</span>
            <select
              value={mapping.balance === undefined ? '' : String(mapping.balance)}
              disabled={!preview}
              onChange={(event) =>
                setMapping((previous) => ({
                  ...previous,
                  balance: event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
                }))
              }
            >
              <option value="">None</option>
              {columnOptions.map((column) => (
                <option key={column.index} value={String(column.index)}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="csv-cleaner-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!canBuild}
            onClick={() => {
              if (!preview || mapping.date === undefined || !file) return
              setError('')
              try {
                const built = buildExtractMintCleanedTable(preview, mapping as BankCsvCleanerMapping)
                setLastStats({ kind: 'extractmint', written: built.stats.written, skippedNoDate: built.stats.skippedNoDate })
                const blob = new Blob([built.text], { type: 'text/plain;charset=utf-8' })
                const cleaned = new File([blob], file.name.replace(/\\.csv$/i, '') + '.extractmint-cleaned.txt', {
                  type: 'text/plain',
                  lastModified: Date.now(),
                })
                props.onConvertCleanedFile(cleaned)
              } catch (buildError) {
                setError(buildError instanceof Error ? buildError.message : 'Failed to build cleaned table')
              }
            }}
          >
            <FileSpreadsheet size={16} />
            Convert cleaned file
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!canBuild}
            onClick={downloadQuickBooksCsv}
            title="Downloads a QuickBooks-friendly 3-column bank CSV (Date, Description, Amount). Amount uses negatives for withdrawals."
          >
            <FileSpreadsheet size={16} />
            Download QuickBooks (CSV)
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!canBuild}
            onClick={downloadQuickBooksCreditDebitCsv}
            title="Downloads a QuickBooks-friendly 4-column bank CSV (Date, Description, Credit, Debit). Credit/Debit are always positive."
          >
            <FileSpreadsheet size={16} />
            Download QuickBooks (Credit/Debit CSV)
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!canBuild}
            onClick={downloadXeroCsv}
            title="Downloads a Xero-friendly bank CSV (Date, Amount, Description, Reference). Amount uses negatives for withdrawals."
          >
            <FileSpreadsheet size={16} />
            Download Xero (CSV)
          </button>
          <small>
            Tip: pick <strong>Amount</strong> if you only have one column (negative = withdrawal, positive = deposit). Date format uses your QuickBooks export
            setting ({resolvedDateFormat === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}).
          </small>
          <label className="csv-cleaner-date-format">
            <span>Date format for exports</span>
            <select
              value={dateFormatOverride}
              onChange={(event) => {
                const next = event.target.value === 'dmy' ? 'dmy' : event.target.value === 'mdy' ? 'mdy' : 'auto'
                setDateFormatOverride(next)
              }}
            >
              <option value="auto">Auto (from app)</option>
              <option value="dmy">DD/MM/YYYY</option>
              <option value="mdy">MM/DD/YYYY</option>
            </select>
          </label>
          <button type="button" className="link-button" onClick={() => setIsTemplatesOpen(true)}>
            Templates & import requirements
          </button>
        </div>

        {dateFormatDetection?.format &&
        dateFormatOverride === 'auto' &&
        dateFormatDetection.sampled >= 6 &&
        dateFormatDetection.format !== resolvedDateFormat ? (
          <div className="warning-banner">
            Date format detection: dates look like <strong>{dateFormatDetection.format === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}</strong> (based on{' '}
            {dateFormatDetection.dmyHints + dateFormatDetection.mdyHints} unambiguous samples), but exports are currently using{' '}
            <strong>{resolvedDateFormat === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}</strong>.{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                if (!dateFormatDetection.format) return
                setDateFormatOverride(dateFormatDetection.format)
              }}
            >
              Use detected format for downloads
            </button>
          </div>
        ) : null}

        {quickBooksChunk && quickBooksChunk.rowCount > 0 ? (
          <div className={quickBooksChunk.rowCount > 1000 ? 'warning-banner' : 'csv-cleaner-preview'}>
            <div className="csv-cleaner-preview-title">QuickBooks import sanity check</div>
            <div style={{ padding: '10px 12px', display: 'grid', gap: 10 }}>
              <div>
                Detected <strong>{quickBooksChunk.rowCount}</strong> transaction rows after the header row.
                {quickBooksChunk.rowCount > 1000 ? (
                  <>
                    {' '}
                    QuickBooks CSV bank imports often fail above <strong>1,000</strong> rows — download in chunks.
                  </>
                ) : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 760, fontSize: 12 }}>Chunk start row</span>
                  <input
                    type="number"
                    min={1}
                    max={quickBooksChunk.rowCount}
                    value={String(quickBooksChunkStart)}
                    onChange={(event) => setQuickBooksChunkStart(Number.parseInt(event.target.value, 10) || 1)}
                    style={{
                      padding: '10px 10px',
                      borderRadius: 12,
                      border: '1px solid rgba(16, 32, 41, 0.18)',
                      background: 'rgba(247, 244, 237, 0.7)',
                      color: 'var(--ink)',
                      fontWeight: 700,
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 760, fontSize: 12 }}>Chunk end row</span>
                  <input
                    type="number"
                    min={1}
                    max={quickBooksChunk.rowCount}
                    value={String(quickBooksChunkEnd)}
                    onChange={(event) => setQuickBooksChunkEnd(Number.parseInt(event.target.value, 10) || 1)}
                    style={{
                      padding: '10px 10px',
                      borderRadius: 12,
                      border: '1px solid rgba(16, 32, 41, 0.18)',
                      background: 'rgba(247, 244, 237, 0.7)',
                      color: 'var(--ink)',
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!canBuild}
                  onClick={() => {
                    setQuickBooksChunkStart(1)
                    setQuickBooksChunkEnd(Math.min(1000, quickBooksChunk.rowCount))
                  }}
                >
                  Set to rows 1–1000
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!canBuild}
                  onClick={() => {
                    const nextStart = Math.min(quickBooksChunk.rowCount, Math.max(1, quickBooksChunk.end + 1))
                    const nextEnd = Math.min(quickBooksChunk.rowCount, nextStart + 999)
                    setQuickBooksChunkStart(nextStart)
                    setQuickBooksChunkEnd(nextEnd)
                  }}
                >
                  Next chunk
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button type="button" className="secondary-button" disabled={!canBuild} onClick={downloadQuickBooksChunkCsv}>
                  <FileSpreadsheet size={16} />
                  Download QuickBooks chunk (CSV)
                </button>
                <button type="button" className="secondary-button" disabled={!canBuild} onClick={downloadQuickBooksChunkCreditDebitCsv}>
                  <FileSpreadsheet size={16} />
                  Download QuickBooks chunk (Credit/Debit CSV)
                </button>
              </div>

              <small style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 640 }}>
                This chunking applies only to downloads generated from this cleaner; it does not modify your original bank export file.
              </small>
            </div>
          </div>
        ) : null}

        {sheetStats?.truncated ? (
          <div className="warning-banner">
            Spreadsheet is large — showing the first <strong>{sheetStats.rowsRead}</strong> rows only. Export a smaller date range for best results.
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}
        {lastStats ? (
          <div className="csv-cleaner-stats">
            {lastStats.kind === 'extractmint' ? 'Cleaned rows' : 'Exported rows'}: <strong>{lastStats.written}</strong> · Skipped missing date:{' '}
            <strong>{lastStats.skippedNoDate}</strong>
            {lastStats.kind !== 'extractmint' ? (
              <>
                {' '}
                · Skipped missing amount: <strong>{lastStats.skippedNoAmount ?? 0}</strong> · Skipped zero amount:{' '}
                <strong>{lastStats.skippedZeroAmount ?? 0}</strong>
              </>
            ) : null}
          </div>
        ) : null}

        {cleanedPreviewRows.length > 0 ? (
          <div className="csv-cleaner-preview" aria-label="Cleaned table preview">
            <div className="csv-cleaner-preview-title">Preview (first {Math.min(6, cleanedPreviewRows.length - 1)} rows)</div>
            <pre>{cleanedPreviewRows.join('\\n')}</pre>
          </div>
        ) : null}
      </div>

      {isTemplatesOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsTemplatesOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="CSV import templates and requirements"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <strong>Templates & import requirements</strong>
                <small>Download a known-good CSV layout, or sanity-check your bank export before importing.</small>
              </div>
              <button type="button" className="modal-close" onClick={() => setIsTemplatesOpen(false)} aria-label="Close templates" title="Close (Esc)">
                Close
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-section">
                <strong>QuickBooks (3-column)</strong>
                <span>
                  Columns: <code>Date</code>, <code>Description</code>, <code>Amount</code>. Amount should be a plain signed number (no currency symbols).
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    downloadTemplate(
                      `quickbooks-bank-3col.${resolvedDateFormat}.template.csv`,
                      `Date,Description,Amount\n${exampleDate},Coffee shop,-12.34\n${exampleDate},Client payment,120.00\n`,
                    )
                  }
                >
                  <FileSpreadsheet size={16} />
                  Download QuickBooks template (3-column)
                </button>
              </div>

              <div className="modal-section">
                <strong>QuickBooks (4-column Credit/Debit)</strong>
                <span>
                  Columns: <code>Date</code>, <code>Description</code>, <code>Credit</code>, <code>Debit</code>. Use positives only; fill either Credit or
                  Debit per row (not both).
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    downloadTemplate(
                      `quickbooks-bank-4col-credit-debit.${resolvedDateFormat}.template.csv`,
                      `Date,Description,Credit,Debit\n${exampleDate},Coffee shop,0,12.34\n${exampleDate},Client payment,120.00,0\n`,
                    )
                  }
                >
                  <FileSpreadsheet size={16} />
                  Download QuickBooks template (Credit/Debit)
                </button>
              </div>

              <div className="modal-section">
                <strong>Xero</strong>
                <span>
                  Columns: <code>Date</code>, <code>Amount</code>, <code>Description</code>, <code>Reference</code>. Amount should be one column containing
                  both income (+) and spend (-).
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    downloadTemplate(
                      `xero-bank.${resolvedDateFormat}.template.csv`,
                      `Date,Amount,Description,Reference\n${exampleDate},-12.34,Coffee shop,VISA\n${exampleDate},120.00,Client payment,INV-1001\n`,
                    )
                  }
                >
                  <FileSpreadsheet size={16} />
                  Download Xero template
                </button>
              </div>

              <div className="modal-section">
                <strong>Common fixes</strong>
                <ul>
                  <li>
                    Keep dates consistent ({resolvedDateFormat === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'} for templates). If day/month swaps, change the date
                    format for exports and re-download.
                  </li>
                  <li>Remove currency symbols, commas, and parentheses negatives (e.g. use -12.34 not (12.34)).</li>
                  <li>Save as UTF-8 CSV and delete extra header/footer rows from bank exports.</li>
                </ul>
              </div>

              <div className="modal-section">
                <strong>Official guides</strong>
                <ul>
                  <li>
                    <a
                      href="https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-get-bank-transactions/L4BjLWckq_US_en_US"
                      target="_blank"
                      rel="noreferrer"
                    >
                      QuickBooks CSV formatting guide
                    </a>
                  </li>
                  <li>
                    <a href="https://central.xero.com/s/article/Import-a-CSV-bank-statement" target="_blank" rel="noreferrer">
                      Xero CSV bank statement import guide
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  )
}
