import { FileSpreadsheet, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { BankCsvCleanerMapping } from '../lib/bankCsvCleaner'
import { buildExtractMintCleanedTable, parseBankDelimitedText, parseBankSpreadsheetFile } from '../lib/bankCsvCleaner'

type Props = {
  onConvertCleanedFile: (file: File) => void
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
  const [lastStats, setLastStats] = useState<{ written: number; skippedNoDate: number } | null>(null)

  const isWorkbook = file ? ['xlsx', 'xls'].includes(extensionOf(file.name)) : false

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
            disabled={!preview || mapping.date === undefined || !file}
            onClick={() => {
              if (!preview || mapping.date === undefined || !file) return
              setError('')
              try {
                const built = buildExtractMintCleanedTable(preview, mapping as BankCsvCleanerMapping)
                setLastStats(built.stats)
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
          <small>
            Tip: pick <strong>Amount</strong> if you only have one column (negative = withdrawal, positive = deposit).
          </small>
        </div>

        {sheetStats?.truncated ? (
          <div className="warning-banner">
            Spreadsheet is large — showing the first <strong>{sheetStats.rowsRead}</strong> rows only. Export a smaller date range for best results.
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}
        {lastStats ? (
          <div className="csv-cleaner-stats">
            Cleaned rows: <strong>{lastStats.written}</strong> · Skipped rows missing date: <strong>{lastStats.skippedNoDate}</strong>
          </div>
        ) : null}

        {cleanedPreviewRows.length > 0 ? (
          <div className="csv-cleaner-preview" aria-label="Cleaned table preview">
            <div className="csv-cleaner-preview-title">Preview (first {Math.min(6, cleanedPreviewRows.length - 1)} rows)</div>
            <pre>{cleanedPreviewRows.join('\\n')}</pre>
          </div>
        ) : null}
      </div>
    </details>
  )
}
