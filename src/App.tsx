import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileArchive,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  PlayCircle,
  ReceiptText,
  ShieldCheck,
  Table2,
  UploadCloud,
} from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { ConversionResult, ProgressEvent, ValidationSummary } from './lib/converter'
import { clearPersistentOcrCache, getPersistentOcrCacheStats } from './lib/ocrCache'
import { getConverterIfLoaded, loadConverter } from './lib/converterLoader'

type ParsedPage = { pageNumber: number; text: string }

const storedValue = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const storeValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

const supportItems = [
  { icon: FileText, label: 'PDF statements' },
  { icon: ReceiptText, label: 'Receipts' },
  { icon: FileArchive, label: 'DOCX and images' },
  { icon: FileSpreadsheet, label: 'XLSX and CSV' },
]

const workflow = [
  {
    title: 'Upload the statement',
    copy: 'Choose a PDF bank statement, receipt, invoice, spreadsheet, or scan.',
  },
  {
    title: 'Read the table layout',
    copy: 'ExtractMint keeps dates, descriptions, references, withdrawals, deposits, and balances in separate columns.',
  },
  {
    title: 'Check the balance trail',
    copy: 'Running balances are preserved so you can quickly spot missing or misread transactions.',
  },
  {
    title: 'Download the file',
    copy: 'Export Excel, CSV, DOCX, PDF, or QuickBooks-ready QBO so you can reconcile immediately.',
  },
]

const metrics = [
  ['40+', 'file and table patterns'],
  ['Local', 'browser-side processing'],
  ['5', 'export formats'],
]

const faqItems = [
  {
    question: 'What does ExtractMint convert?',
    answer:
      'It converts bank statements, receipts, invoices, PDFs, DOCX files, CSV files, spreadsheets, and image scans into structured outputs.',
  },
  {
    question: 'Does it work with bank statement tables?',
    answer:
      'Yes. For text-based PDFs it reads table positions, separates withdrawal, deposit, tax, balance, reference, date, and description columns, then exports them to Excel.',
  },
  {
    question: 'Are my files uploaded to a server?',
    answer:
      'This static version processes files in your browser. The file stays on your device unless you later add a backend conversion queue.',
  },
  {
    question: 'What files can I download?',
    answer:
      'You can download Excel XLSX, CSV, Google Docs-ready DOCX, PDF summaries, and a QuickBooks-ready QBO (OFX) file from the same extracted data.',
  },
  {
    question: 'Will scanned statements always work?',
    answer:
      'Yes — when a PDF has little embedded text, ExtractMint falls back to browser OCR per page. Clean scans work best; extremely noisy scans may still need manual review.',
  },
  {
    question: 'Can this become a paid SaaS?',
    answer:
      'Yes. The current version is a deployable static prototype. Accounts, credits, batch jobs, API access, and audit logs can be added with a backend.',
  },
  {
    question: 'Can I resume a conversion later?',
    answer:
      'Yes. Download the review JSON (or the review pack ZIP). Later, upload the .extractmint-review.json file to restore the extracted rows, validations, and continue exporting without re-processing the original PDF.',
  },
]

const createSampleResultLite = (): ConversionResult => ({
  fileName: 'sample-bank-statement.pdf',
  fileType: 'application/pdf',
  currencyCode: 'USD',
  statementPeriod: {
    start: '2026-04-01',
    end: '2026-04-30',
    source: 'inferred',
  },
  fileMeta: {
    size: 0,
    lastModified: Date.now(),
    sha256: 'sample',
  },
  rawText: 'Sample statement preview (conversion runs after upload).',
  rows: [
    {
      date: '2026-04-02',
      description: 'STRIPE PAYOUT INV-1082',
      deposit: 8420,
      amount: 8420,
      balance: 24991.2,
      reference: 'INV-1082',
      category: 'Income',
      confidence: 0.93,
      source: 'sample',
    },
    {
      date: '2026-04-05',
      description: 'AWS CLOUD SERVICES',
      withdrawal: 842.1,
      amount: -842.1,
      balance: 24149.1,
      reference: '',
      category: 'Expense',
      confidence: 0.92,
      source: 'sample',
    },
    {
      date: '2026-04-08',
      description: 'CLIENT ACME RETAINER',
      deposit: 12500,
      amount: 12500,
      balance: 36649.1,
      reference: '',
      category: 'Income',
      confidence: 0.93,
      source: 'sample',
    },
  ],
  confidence: 92,
  validation: {
    status: 'review',
    checkedRows: 2,
    issueCount: 1,
    openingBalance: undefined,
    closingBalance: 38268.1,
    issues: [
      {
        severity: 'info',
        message: 'Upload a real statement to validate the full running balance trail.',
      },
    ],
  },
  processedAt: new Date().toISOString(),
  summary: {
    title: 'Sample statement',
    documentKind: 'Bank statement',
    total: 0,
    vendor: 'ExtractMint',
    notes: ['Sample preview only. Upload a file to run extraction.'],
  },
})

function fileSignatureParts(fileName: string, size: number, lastModified: number) {
  return `${fileName}:${size}:${lastModified}`
}

function parsePagesFromRawText(rawText: string): ParsedPage[] {
  const text = rawText ?? ''
  const matches = Array.from(text.matchAll(/^Page\s+(\d+)\s*$/gim))
  if (matches.length === 0) {
    return [{ pageNumber: 1, text }]
  }

  const pages: ParsedPage[] = []
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length
    const pageNumber = Number(match[1] ?? index + 1)
    const body = text.slice(start, end).trim()
    pages.push({ pageNumber: Number.isFinite(pageNumber) ? pageNumber : index + 1, text: body })
  }
  return pages.length > 0 ? pages : [{ pageNumber: 1, text }]
}

function normalizeSearchText(value: string) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bestMatchingPage(pages: ParsedPage[], row: ConversionResult['rows'][number] | undefined) {
  if (!row || pages.length === 0) return pages[0]?.pageNumber ?? 1
  const dateHint = normalizeSearchText(row.date ?? '')
  const descHint = normalizeSearchText(row.description).split(' ').slice(0, 8).join(' ')
  if (!dateHint && !descHint) return pages[0]?.pageNumber ?? 1

  let bestPage = pages[0]?.pageNumber ?? 1
  let bestScore = -1

  for (const page of pages) {
    const normalized = normalizeSearchText(page.text)
    let score = 0
    if (dateHint && normalized.includes(dateHint)) score += 4
    if (descHint && normalized.includes(descHint)) score += 5
    if (descHint) {
      const words = descHint.split(' ').filter(Boolean)
      const hits = words.reduce((sum, word) => (normalized.includes(word) ? sum + 1 : sum), 0)
      score += Math.min(3, hits)
    }
    if (score > bestScore) {
      bestScore = score
      bestPage = page.pageNumber
    }
  }

  return bestPage
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<ConversionResult[]>([createSampleResultLite()])
  const [activeIndex, setActiveIndex] = useState(0)
  const [showAllRows, setShowAllRows] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [editRows, setEditRows] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [forceOcr, setForceOcr] = useState(() => storedValue('extractmint.forceOcr') === '1')
  const [ocrLanguage, setOcrLanguage] = useState(() => storedValue('extractmint.ocrLanguage') || 'eng')
  const [persistOcrCache, setPersistOcrCache] = useState(() => storedValue('extractmint.persistOcrCache') !== '0')
  const [ocrCacheStats, setOcrCacheStats] = useState<{ entries: number; bytes: number }>({ entries: 0, bytes: 0 })
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfUrlsBySha, setPdfUrlsBySha] = useState<Record<string, string>>({})
  const pdfUrlRef = useRef<Record<string, string>>({})
  const [progress, setProgress] = useState<ProgressEvent>({
    fileName: 'sample-bank-statement.pdf',
    stage: 'ready',
    percent: 100,
    detail: 'Sample conversion loaded',
  })

  const activeResult = results[activeIndex] ?? results[0]
  const activeSha = activeResult?.fileMeta?.sha256
  const activePdfUrl = activeSha ? pdfUrlsBySha[activeSha] : undefined
  const activePages = useMemo(() => parsePagesFromRawText(activeResult?.rawText ?? ''), [activeResult?.rawText])

  useEffect(() => {
    pdfUrlRef.current = pdfUrlsBySha
  }, [pdfUrlsBySha])

  useEffect(() => {
    return () => {
      const urls = Object.values(pdfUrlRef.current)
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
      })
    }
  }, [])

  const refreshOcrCacheStats = () => {
    if (!persistOcrCache) return
    void (async () => {
      setOcrCacheStats(await getPersistentOcrCacheStats())
    })()
  }

  useEffect(() => {
    refreshOcrCacheStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistOcrCache])

  const statementPeriodLabel = (period?: ConversionResult['statementPeriod']) => {
    if (!period?.start && !period?.end) return '—'
    if (period.start && period.end && period.start !== period.end) return `${period.start} → ${period.end}`
    return period.start ?? period.end ?? '—'
  }

  const parseMoneyInput = (value: string) => {
    const text = value.trim()
    if (!text) return undefined
    const isNegative = text.includes('(') || text.startsWith('-')
    const numeric = Number(text.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(numeric)) return undefined
    return isNegative ? -numeric : numeric
  }

  const updateRow = (
    resultIndex: number,
    rowIndex: number,
    field:
      | 'date'
      | 'description'
      | 'reference'
      | 'withdrawal'
      | 'deposit'
      | 'amount'
      | 'balance',
    rawValue: string,
  ) => {
    setResults((previous) => {
      const target = previous[resultIndex]
      if (!target) return previous
      const originalRow = target.rows[rowIndex]
      if (!originalRow) return previous

      const nextRows = [...target.rows]
      const nextRow = { ...originalRow }

      if (field === 'date') {
        nextRow.date = rawValue.trim() ? rawValue.trim() : undefined
      } else if (field === 'description') {
        nextRow.description = rawValue.trim() || nextRow.description
      } else if (field === 'reference') {
        nextRow.reference = rawValue.trim() ? rawValue.trim() : undefined
      } else if (field === 'withdrawal') {
        const parsed = parseMoneyInput(rawValue)
        nextRow.withdrawal = parsed === undefined ? undefined : Math.abs(parsed)
        if (nextRow.withdrawal !== undefined) {
          nextRow.deposit = undefined
          nextRow.amount = -Math.abs(nextRow.withdrawal)
        }
      } else if (field === 'deposit') {
        const parsed = parseMoneyInput(rawValue)
        nextRow.deposit = parsed === undefined ? undefined : Math.abs(parsed)
        if (nextRow.deposit !== undefined) {
          nextRow.withdrawal = undefined
          nextRow.amount = Math.abs(nextRow.deposit)
        }
      } else if (field === 'amount') {
        const parsed = parseMoneyInput(rawValue)
        nextRow.amount = parsed
        if (parsed !== undefined) {
          nextRow.withdrawal = undefined
          nextRow.deposit = undefined
        }
      } else if (field === 'balance') {
        nextRow.balance = parseMoneyInput(rawValue)
      }

      nextRows[rowIndex] = nextRow

      const converter = getConverterIfLoaded()
      const nextValidation = converter
        ? converter.revalidateRows(nextRows, target.currencyCode || 'USD')
        : target.validation
      const nextResults = [...previous]
      nextResults[resultIndex] = {
        ...target,
        rows: nextRows,
        validation: nextValidation,
        statementPeriod: converter
          ? converter.refreshStatementPeriod(nextRows, target.statementPeriod)
          : target.statementPeriod,
      }
      return nextResults
    })
  }

  const visibleRows = useMemo(() => {
    const result = activeResult
    if (!result) return []
    const indexed = result.rows.map((row, index) => ({ row, index }))
    const filtered = onlyIssues
      ? indexed.filter(({ index }) => {
          const review = rowReview(result.validation, index)
          return review.status === 'Review' || review.status === 'Check'
        })
      : indexed
    return showAllRows ? filtered : filtered.slice(0, 8)
  }, [activeResult, onlyIssues, showAllRows])
  const totals = useMemo(() => {
    const rows = results.flatMap((result) => result.rows)
    const amount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
    return {
      files: results.length,
      rows: rows.length,
      amount,
      confidence:
        results.length === 0
          ? 0
          : Math.round(
              results.reduce((sum, result) => sum + result.confidence, 0) /
                results.length,
            ),
    }
  }, [results])

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const converter = await loadConverter()
    const signatureUrls: Record<string, string> = {}
    const reviewJsonFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith('.extractmint-review.json'),
    )
    const normalFiles = files.filter(
      (file) => !file.name.toLowerCase().endsWith('.extractmint-review.json'),
    )

    normalFiles.forEach((file) => {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const sig = fileSignatureParts(file.name, file.size, file.lastModified)
        if (!signatureUrls[sig]) {
          signatureUrls[sig] = URL.createObjectURL(file)
        }
      }
    })

    setIsProcessing(true)
    setActiveIndex(0)
    try {
      const imported: ConversionResult[] = []
      for (let index = 0; index < reviewJsonFiles.length; index += 1) {
        const file = reviewJsonFiles[index]
        setProgress({
          fileName: file.name,
          stage: 'reading',
          percent: Math.round((index / Math.max(1, reviewJsonFiles.length)) * 100),
          detail: 'Importing ExtractMint review JSON',
        })
        try {
          imported.push(await converter.importReviewJson(file))
        } catch (error) {
          throw new Error(
            `Failed to import ${file.name}: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
            { cause: error },
          )
        }
      }

      const converted =
        normalFiles.length === 0
          ? []
          : await converter.convertFiles(normalFiles, setProgress, {
              forceOcr,
              ocrLanguage,
              persistOcrCache,
            })

      if (converted.length > 0) {
        setPdfUrlsBySha((previous) => {
          const next: Record<string, string> = { ...previous }
          for (const result of converted) {
            const sha = result.fileMeta.sha256
            if (!sha) continue
            const sig = fileSignatureParts(result.fileName, result.fileMeta.size, result.fileMeta.lastModified)
            const url = signatureUrls[sig]
            if (!url) continue

            const existing = next[sha]
            if (existing && existing !== url) {
              try {
                URL.revokeObjectURL(existing)
              } catch {
                // ignore
              }
            }
            next[sha] = url
          }
          return next
        })
      }

      const combined = [...imported, ...converted]
      if (combined.length === 0) return
      setResults(combined)
      refreshOcrCacheStats()
      setProgress({
        fileName: combined.length === 1 ? combined[0].fileName : `${combined.length} files`,
        stage: 'complete',
        percent: 100,
        detail: 'Conversion package is ready',
      })
    } catch (error) {
      setProgress({
        fileName: files.length === 1 ? files[0].name : `${files.length} files`,
        stage: 'error',
        percent: 100,
        detail: error instanceof Error ? error.message : 'Conversion failed',
      })
      Object.values(signatureUrls).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void processFiles(event.dataTransfer.files)
  }

  const downloadBlob = async (format: 'xlsx' | 'csv' | 'docx' | 'pdf' | 'qbo') => {
    if (!activeResult) return

    const converter = await loadConverter()
    const creators = {
      xlsx: converter.createExcelBlob,
      csv: converter.createCsvBlob,
      docx: converter.createDocxBlob,
      pdf: converter.createPdfBlob,
      qbo: converter.createQboBlob,
    }
    const blob = await creators[format](activeResult)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const baseName = activeResult.fileName.replace(/\.[^.]+$/, '') || 'extractmint'
    anchor.href = url
    anchor.download = `${baseName}.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const downloadReviewJson = () => {
    if (!activeResult) return
    void (async () => {
      const converter = await loadConverter()
      const blob = converter.createReviewJsonBlob(activeResult)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const baseName = activeResult.fileName.replace(/\.[^.]+$/, '') || 'extractmint'
      anchor.href = url
      anchor.download = `${baseName}.extractmint-review.json`
      anchor.click()
      URL.revokeObjectURL(url)
    })()
  }

  const downloadReviewPack = async () => {
    if (results.length === 0) return
    setIsProcessing(true)
    setProgress({
      fileName: results.length === 1 ? results[0].fileName : `${results.length} files`,
      stage: 'exporting',
      percent: 92,
      detail: 'Building review pack ZIP',
    })
    try {
      const converter = await loadConverter()
      const blob = await converter.createReviewPackZipBlob(results)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `extractmint-review-pack-${stamp}.zip`
      anchor.click()
      URL.revokeObjectURL(url)
      setProgress({
        fileName: `${results.length} files`,
        stage: 'complete',
        percent: 100,
        detail: 'Review pack downloaded',
      })
    } catch (error) {
      setProgress({
        fileName: `${results.length} files`,
        stage: 'error',
        percent: 100,
        detail: error instanceof Error ? error.message : 'Review pack export failed',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadCombinedWorkbook = async () => {
    if (results.length < 2) return
    setIsProcessing(true)
    setProgress({
      fileName: `${results.length} files`,
      stage: 'exporting',
      percent: 92,
      detail: 'Building combined workbook',
    })
    try {
      const converter = await loadConverter()
      const blob = await converter.createCombinedExcelBlob(results)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `extractmint-combined-${stamp}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
      setProgress({
        fileName: `${results.length} files`,
        stage: 'complete',
        percent: 100,
        detail: 'Combined workbook downloaded',
      })
    } catch (error) {
      setProgress({
        fileName: `${results.length} files`,
        stage: 'error',
        percent: 100,
        detail: error instanceof Error ? error.message : 'Combined workbook export failed',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const attachPdfToActiveResult = (file: File | null) => {
    if (!file || !activeResult?.fileMeta.sha256) return
    const sha = activeResult.fileMeta.sha256
    const url = URL.createObjectURL(file)
    setPdfUrlsBySha((previous) => {
      const next = { ...previous }
      const existing = next[sha]
      if (existing && existing !== url) {
        try {
          URL.revokeObjectURL(existing)
        } catch {
          // ignore
        }
      }
      next[sha] = url
      return next
    })
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ExtractMint home">
          <span className="brand-mark">
            <LogoMark />
          </span>
          <span className="brand-copy">
            <strong>ExtractMint</strong>
            <small>Ledger-grade exports</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#converter">Converter</a>
          <a href="#formats">Formats</a>
          <a href="#video">Demo</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="header-action" href="#converter">
          Try it
          <ChevronRight size={16} />
        </a>
      </header>

      <section id="top" className="hero-section">
        <div className="hero-copy">
          <motion.p
            className="eyebrow"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Ledger-grade document extraction
          </motion.p>
          <motion.h1
            className="animated-headline"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <motion.span
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              Statements in.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
            >
              Reconciled files out.
            </motion.span>
          </motion.h1>
          <motion.p
            className="hero-lede"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Upload a PDF statement, receipt, or invoice. ExtractMint reads the
            table, validates the balance trail, and exports Excel, CSV, DOCX,
            PDF, QBO, and review packs without sending files to a server.
          </motion.p>
          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            <button className="primary-button" onClick={() => inputRef.current?.click()}>
              <UploadCloud size={18} />
              Upload files
            </button>
            <a className="secondary-button" href="#video">
              <PlayCircle size={18} />
              Watch flow
            </a>
          </motion.div>
          <motion.div
            className="hero-proof"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            aria-label="Product trust signals"
          >
            <span>
              <LockKeyhole size={16} />
              Browser-side processing
            </span>
            <span>
              <BadgeCheck size={16} />
              Balance trail checks
            </span>
            <span>
              <FileSpreadsheet size={16} />
              Excel and QBO exports
            </span>
          </motion.div>
          <div className="support-strip" id="formats">
            {supportItems.map((item) => (
              <span key={item.label}>
                <item.icon size={17} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <motion.div
          className="product-stage"
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.55 }}
        >
          <div className="stage-frame" aria-hidden="true" />
          <div className="stage-glow" />
          <motion.div
            className="scan-path"
            animate={{ x: ['-18%', '118%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          <motion.div
            className="data-chip chip-pdf"
            animate={{ y: [0, -12, 0], rotate: [-4, 3, -4] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            PDF
          </motion.div>
          <motion.div
            className="data-chip chip-excel"
            animate={{ y: [0, 10, 0], rotate: [5, -2, 5] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            XLSX
          </motion.div>
          <motion.div
            className="data-chip chip-balance"
            animate={{ y: [0, -9, 0], scale: [1, 1.04, 1] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            RM 3,669.19
          </motion.div>
          <div className="document-stack" aria-hidden="true">
            <motion.div
              className="paper paper-left"
              animate={{ y: [-2, 7, -2], rotate: [-8, -5, -8] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="paper paper-right"
              animate={{ y: [6, -4, 6], rotate: [7, 4, 7] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <motion.div
            className="converter-card"
            id="converter"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="converter-toolbar">
              <span>Live extraction desk</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
            <label
              className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.docx,.txt,.csv,.xlsx,.xls"
                onChange={(event) => {
                  if (event.target.files) void processFiles(event.target.files)
                }}
              />
              <motion.span
                className="drop-icon"
                animate={{ scale: [1, 1.08, 1], rotate: [0, -2, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Cloud size={28} />
              </motion.span>
              <strong>Drop documents here</strong>
              <small>or click to choose files from your desktop</small>
            </label>

            <div className="ocr-settings" aria-label="OCR settings">
              <label>
                <input
                  type="checkbox"
                  checked={forceOcr}
                  onChange={(event) => {
                    const next = event.target.checked
                    setForceOcr(next)
                    storeValue('extractmint.forceOcr', next ? '1' : '0')
                  }}
                />
                Force OCR (scanned PDFs)
              </label>
              <label>
                OCR language
                <select
                  value={ocrLanguage}
                  onChange={(event) => {
                    const next = event.target.value
                    setOcrLanguage(next)
                    storeValue('extractmint.ocrLanguage', next)
                  }}
                >
                  <option value="eng">English</option>
                  <option value="msa">Malay</option>
                  <option value="ind">Indonesian</option>
                  <option value="chi_sim">Chinese (Simplified)</option>
                </select>
              </label>
              <label className="ocr-cache-row">
                <input
                  type="checkbox"
                  checked={persistOcrCache}
                  onChange={(event) => {
                    const next = event.target.checked
                    setPersistOcrCache(next)
                    storeValue('extractmint.persistOcrCache', next ? '1' : '0')
                  }}
                />
                Persist OCR cache (faster repeat exports)
                {persistOcrCache ? (
                  <span className="ocr-cache-meta">
                    {ocrCacheStats.entries} saved · {Math.round(ocrCacheStats.bytes / 1024)} KB
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        void (async () => {
                          await clearPersistentOcrCache()
                          refreshOcrCacheStats()
                        })()
                      }}
                    >
                      Clear
                    </button>
                  </span>
                ) : null}
              </label>
            </div>

	            <div className="progress-panel">
	              <div>
	                <span>{progress.stage}</span>
	                <strong>{progress.fileName}</strong>
                <small>{progress.detail}</small>
              </div>
              <div className="progress-ring" aria-label={`${progress.percent}% complete`}>
                <svg viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" />
                  <motion.circle
                    cx="24"
                    cy="24"
                    r="20"
                    initial={false}
                    animate={{
                      pathLength: Math.min(100, Math.max(0, progress.percent)) / 100,
                    }}
                  />
                </svg>
                <span>{progress.percent}%</span>
              </div>
            </div>

            <div className="export-row">
              <button onClick={() => void downloadBlob('xlsx')} disabled={!activeResult}>
                <FileSpreadsheet size={16} />
                Excel
              </button>
              <button
                onClick={() => void downloadCombinedWorkbook()}
                disabled={results.length < 2}
                title="Download a single workbook with one sheet per file plus a combined Issues tab."
              >
                <Table2 size={16} />
                Combined XLSX
              </button>
              <button onClick={downloadReviewJson} disabled={!activeResult}>
                <ShieldCheck size={16} />
                Review JSON
              </button>
              <button onClick={() => void downloadReviewPack()} disabled={results.length === 0}>
                <FileArchive size={16} />
                Review pack (ZIP)
              </button>
              <button onClick={() => void downloadBlob('docx')} disabled={!activeResult}>
                <FileText size={16} />
                Google Docs
              </button>
              <button onClick={() => void downloadBlob('pdf')} disabled={!activeResult}>
                <FileText size={16} />
                PDF
              </button>
              <button onClick={() => void downloadBlob('csv')} disabled={!activeResult}>
                <ArrowDownToLine size={16} />
                CSV
              </button>
              <button onClick={() => void downloadBlob('qbo')} disabled={!activeResult}>
                <ReceiptText size={16} />
                QuickBooks (QBO)
              </button>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="summary-band" aria-label="Conversion summary">
        {metrics.map(([value, label], index) => (
          <motion.div
            key={label}
            initial={{ y: 14 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.06 }}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </motion.div>
        ))}
      </section>

      <section className="results-section">
        <div className="section-heading">
          <span className="eyebrow">Converted workspace</span>
          <h2>Your outputs stay readable after export.</h2>
        </div>
        <div className="workspace-grid">
          <aside className="file-list">
            <div className="mini-stat">
              <BarChart3 size={18} />
              <span>{totals.rows} rows</span>
              <strong>{totals.confidence}% confidence</strong>
            </div>
            {results.map((result, index) => (
              <button
                key={`${result.fileName}-${index}`}
                className={index === activeIndex ? 'active' : ''}
                onClick={() => {
                  setActiveIndex(index)
                  setSelectedRowIndex(null)
                  setPdfPage(1)
                }}
              >
                <FileText size={18} />
                <span>
                  <strong>{result.fileName}</strong>
                  <small>{result.rows.length} extracted rows</small>
                </span>
              </button>
            ))}
          </aside>

          <div className="preview-panel">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeResult?.fileName ?? 'empty'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="preview-header">
                  <div>
                    <span>{activeResult?.fileType ?? 'document'}</span>
                    <h3>{activeResult?.summary.title ?? 'No file selected'}</h3>
                  </div>
                  <div className={`confidence-pill ${validationClass(activeResult?.validation.status)}`}>
                    {activeResult?.validation.status === 'review' ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <BadgeCheck size={16} />
                    )}
                    {activeResult?.confidence ?? 0}% match
                  </div>
                </div>
                <div className="summary-cards">
                  <div>
                    <span>Total detected</span>
                    <strong>
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: activeResult?.currencyCode ?? 'USD',
                      }).format(activeResult?.summary.total ?? totals.amount)}
                    </strong>
                  </div>
                  <div>
                    <span>Likely source</span>
                    <strong>{activeResult?.summary.documentKind ?? 'Statement'}</strong>
                  </div>
                  <div>
                    <span>Statement period</span>
                    <strong>{statementPeriodLabel(activeResult?.statementPeriod)}</strong>
                  </div>
                  <div className="validation-card">
                    <span>Balance check</span>
                    <strong>{validationTitle(activeResult?.validation)}</strong>
                    <small>{validationDescription(activeResult?.validation)}</small>
                  </div>
                </div>

                <div className={editRows ? 'review-split' : undefined}>
                  <div className="table-wrap">
                    <div className="table-controls" aria-label="Review controls">
                      <label>
                        <input
                          type="checkbox"
                          checked={showAllRows}
                          onChange={(event) => setShowAllRows(event.target.checked)}
                        />
                        Show all rows
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={onlyIssues}
                          onChange={(event) => setOnlyIssues(event.target.checked)}
                        />
                        Only flagged rows
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={editRows}
                          onChange={(event) => setEditRows(event.target.checked)}
                        />
                        Edit values
                      </label>
                      <span className="table-hint">Edits instantly re-check the running balance trail.</span>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Withdrawal</th>
                          <th>Deposit</th>
                          <th>Balance</th>
                          <th>Review</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(({ row, index }) => {
                          const review = rowReview(activeResult?.validation, index)
                          const isSelected = selectedRowIndex === index
                          return (
                            <tr
                              key={`${row.description}-${index}`}
                              className={[
                                review.status === 'Review' ? 'needs-review' : '',
                                isSelected ? 'row-selected' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => {
                                setSelectedRowIndex(index)
                                setPdfPage(bestMatchingPage(activePages, row))
                              }}
                            >
                              <td>
                                {editRows ? (
                                  <input
                                    key={`${activeIndex}-${index}-date-${row.date ?? ''}`}
                                    defaultValue={row.date ?? ''}
                                    placeholder="YYYY-MM-DD"
                                    onFocus={() => {
                                      setSelectedRowIndex(index)
                                      setPdfPage(bestMatchingPage(activePages, row))
                                    }}
                                    onBlur={(event) => updateRow(activeIndex, index, 'date', event.target.value)}
                                  />
                                ) : (
                                  (row.date || 'Detected')
                                )}
                              </td>
                              <td>
                                {editRows ? (
                                  <input
                                    key={`${activeIndex}-${index}-desc-${row.description}`}
                                    defaultValue={row.description}
                                    onFocus={() => {
                                      setSelectedRowIndex(index)
                                      setPdfPage(bestMatchingPage(activePages, row))
                                    }}
                                    onBlur={(event) =>
                                      updateRow(activeIndex, index, 'description', event.target.value)
                                    }
                                  />
                                ) : (
                                  row.description
                                )}
                                {review.note ? <small className="review-note">{review.note}</small> : null}
                              </td>
                              <td>
                                {editRows ? (
                                  <input
                                    key={`${activeIndex}-${index}-withdrawal-${row.withdrawal ?? ''}`}
                                    defaultValue={row.withdrawal !== undefined ? String(row.withdrawal) : ''}
                                    inputMode="decimal"
                                    placeholder="-"
                                    onFocus={() => {
                                      setSelectedRowIndex(index)
                                      setPdfPage(bestMatchingPage(activePages, row))
                                    }}
                                    onBlur={(event) =>
                                      updateRow(activeIndex, index, 'withdrawal', event.target.value)
                                    }
                                  />
                                ) : (
                                  formatAmount(row.withdrawal, activeResult?.currencyCode)
                                )}
                              </td>
                              <td>
                                {editRows ? (
                                  <input
                                    key={`${activeIndex}-${index}-deposit-${row.deposit ?? ''}`}
                                    defaultValue={row.deposit !== undefined ? String(row.deposit) : ''}
                                    inputMode="decimal"
                                    placeholder="-"
                                    onFocus={() => {
                                      setSelectedRowIndex(index)
                                      setPdfPage(bestMatchingPage(activePages, row))
                                    }}
                                    onBlur={(event) => updateRow(activeIndex, index, 'deposit', event.target.value)}
                                  />
                                ) : (
                                  formatAmount(row.deposit, activeResult?.currencyCode)
                                )}
                              </td>
                              <td>
                                {editRows ? (
                                  <input
                                    key={`${activeIndex}-${index}-balance-${row.balance ?? ''}`}
                                    defaultValue={row.balance !== undefined ? String(row.balance) : ''}
                                    inputMode="decimal"
                                    placeholder="-"
                                    onFocus={() => {
                                      setSelectedRowIndex(index)
                                      setPdfPage(bestMatchingPage(activePages, row))
                                    }}
                                    onBlur={(event) => updateRow(activeIndex, index, 'balance', event.target.value)}
                                  />
                                ) : (
                                  formatAmount(row.balance, activeResult?.currencyCode)
                                )}
                              </td>
                              <td>
                                <span className={`review-pill ${review.status.toLowerCase()}`}>
                                  {review.status}
                                </span>
                              </td>
                              <td>{row.category}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {editRows && activeResult?.fileType === 'application/pdf' ? (
                    <aside className="source-preview" aria-label="Source PDF preview">
                      <div className="source-header">
                        <div>
                          <span>Source PDF</span>
                          <strong>{activeResult.fileName}</strong>
                        </div>
                        <div className="page-controls">
                          <button
                            type="button"
                            onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                            aria-label="Previous page"
                          >
                            Prev
                          </button>
                          <label>
                            <span>Page</span>
                            <input
                              value={String(pdfPage)}
                              inputMode="numeric"
                              onChange={(event) => {
                                const next = Number(event.target.value)
                                if (Number.isFinite(next) && next > 0) setPdfPage(Math.floor(next))
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setPdfPage((p) => p + 1)}
                            aria-label="Next page"
                          >
                            Next
                          </button>
                        </div>
                      </div>

                      {activePdfUrl ? (
                        <iframe
                          className="pdf-frame"
                          title={`PDF preview for ${activeResult.fileName}`}
                          src={`${activePdfUrl}#page=${pdfPage}&zoom=page-width`}
                        />
                      ) : (
                        <div className="source-empty">
                          <p>This review JSON does not include the original PDF. Attach it to enable preview.</p>
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(event) => attachPdfToActiveResult(event.target.files?.[0] ?? null)}
                          />
                        </div>
                      )}

                      <div className="source-hint">
                        Click a row to jump to the most likely page (best-effort text match).
                      </div>
                    </aside>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="video">
        <div className="section-heading">
          <span className="eyebrow">How it works</span>
          <h2>From statement PDF to Excel rows you can reconcile.</h2>
        </div>
        <div className="workflow-grid">
          {workflow.map((step, index) => (
            <motion.article
              key={step.title}
              initial={{ y: 18 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </motion.article>
          ))}
        </div>
        <div className="process-demo" aria-label="Animated statement conversion example">
          <motion.div
            className="scan-line"
            animate={{ x: ['-5%', '105%'] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="source-statement">
            <div className="demo-label">PDF statement</div>
            <div className="statement-row">
              <span>13/03/2025</span>
              <span>POS DEBIT</span>
              <span>8.18</span>
              <span>3,272.50</span>
            </div>
            <div className="statement-row">
              <span>17/03/2025</span>
              <span>AUTOPAY CR</span>
              <span>8.18</span>
              <span>3,279.33</span>
            </div>
            <div className="statement-row">
              <span>24/03/2025</span>
              <span>TR IBG</span>
              <span>1,000.00</span>
              <span>2,275.58</span>
            </div>
          </div>
          <div className="mapping-column">
            <motion.span
              animate={{ opacity: [0.42, 1, 0.42] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              detect columns
            </motion.span>
            <motion.span
              animate={{ opacity: [1, 0.42, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              verify balances
            </motion.span>
          </div>
          <div className="excel-output">
            <div className="demo-label">Excel output</div>
            <div className="excel-head">
              <span>Date</span>
              <span>Description</span>
              <span>Withdrawal</span>
              <span>Deposit</span>
              <span>Balance</span>
            </div>
            {[
              ['13/03/2025', 'POS DEBIT', '8.18', '', '3,272.50'],
              ['17/03/2025', 'AUTOPAY CR', '', '8.18', '3,279.33'],
              ['24/03/2025', 'TR IBG', '1,000.00', '', '2,275.58'],
            ].map((row) => (
              <div className="excel-row" key={row.join('-')}>
                {row.map((cell, index) => (
                  <span key={`${cell}-${index}`}>{cell}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-section">
        <div>
          <LockKeyhole size={22} />
          <h3>Private by default</h3>
          <p>Files are parsed in the browser for this static build.</p>
        </div>
        <div>
          <CheckCircle2 size={22} />
          <h3>Messy-doc tolerant</h3>
          <p>PDF text, DOCX, sheets, images, receipts, and plain text are supported.</p>
        </div>
        <div>
          <Table2 size={22} />
          <h3>Spreadsheet-first</h3>
          <p>Rows, references, withdrawals, deposits, and balances export as usable columns.</p>
        </div>
        <div>
          <ShieldCheck size={22} />
          <h3>Ready for SaaS scale</h3>
          <p>The product can grow into credits, API keys, team access, and audit logs.</p>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>What people usually want to know before trying it.</h2>
        </div>
        <div className="faq-grid">
          {faqItems.map((item, index) => (
            <motion.details
              key={item.question}
              initial={{ opacity: 0.92, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.04 }}
            >
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </motion.details>
          ))}
        </div>
      </section>

      <footer>
        <strong>
          <span className="footer-mark">
            <LogoMark />
          </span>
          ExtractMint
        </strong>
        <span>Document extraction for operators, accountants, and founders.</span>
      </footer>

      {isProcessing && (
        <div className="processing-toast">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          >
            <Table2 size={18} />
          </motion.div>
          Extracting structure...
        </div>
      )}
    </main>
  )
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="ExtractMint mark">
      <path
        d="M7.5 5.5h12.25L24.5 10.25v16.25h-17z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M19.5 6v5h5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11.5 15.25h8.25M11.5 19h5.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11.5 22.75h3.25M17.25 22.75h3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M18.25 20.5l2.05 2.05 4.45-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}

function formatAmount(value?: number, currencyCode: string = 'USD') {
  if (value === undefined || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(value)
}

function validationTitle(validation?: ValidationSummary) {
  if (!validation) return 'Not checked'
  if (validation.status === 'valid') return 'Verified'
  if (validation.status === 'review') return 'Needs review'
  return 'Not enough data'
}

function validationDescription(validation?: ValidationSummary) {
  if (!validation) return 'Upload a file to validate running balances.'
  if (validation.status === 'valid') {
    return `${validation.checkedRows} balance transitions matched.`
  }
  if (validation.status === 'review') {
    return `${validation.issueCount} issue${validation.issueCount === 1 ? '' : 's'} flagged.`
  }
  return 'Balances or amounts were missing from the extracted rows.'
}

function validationClass(status?: ValidationSummary['status']) {
  if (status === 'valid') return 'is-valid'
  if (status === 'review') return 'is-review'
  return 'is-missing'
}

function rowReview(validation: ValidationSummary | undefined, rowIndex: number) {
  if (!validation) return { status: 'Unvalidated', note: '' }
  const issues = validation.issues.filter((issue) => issue.rowIndex === rowIndex)
  const note = issues.map((issue) => issue.message).join(' ')
  if (issues.some((issue) => issue.severity === 'error')) return { status: 'Review', note }
  if (issues.length > 0) return { status: 'Check', note }
  if (validation.checkedRows > 0) return { status: 'Verified', note: '' }
  return { status: 'Unvalidated', note: '' }
}

export default App
