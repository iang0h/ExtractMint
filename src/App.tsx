import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Copy,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Tag,
  LockKeyhole,
  PlayCircle,
  ReceiptText,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Table2,
  UploadCloud,
} from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { PdfCanvasViewer, type PdfDocumentProxy, type PdfMatchInfo } from './components/PdfCanvasViewer'
import type { ConversionResult, ProgressEvent, ValidationSummary } from './lib/converter'
import { clearPersistentOcrCache, getPersistentOcrCacheStats } from './lib/ocrCache'
import {
  clearPersistentPdfTextIndex,
  getPersistentPdfPageText,
  getPersistentPdfTextIndexStats,
  setPersistentPdfPageText,
} from './lib/pdfTextIndexCache'
import { getConverterIfLoaded, loadConverter } from './lib/converterLoader'

type ParsedPage = { pageNumber: number; text: string }
type AgentMessage = {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  warning?: string
}

type ExportSanitySnapshot = {
  openingBalance?: number
  closingBalance?: number
  netChange?: number
  deposits: number
  withdrawals: number
  transactionNet: number
  discrepancy?: number
  hasBalanceTrail: boolean
}

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

const statementPeriodLabel = (period?: ConversionResult['statementPeriod']) => {
  if (!period?.start && !period?.end) return '—'
  if (period.start && period.end && period.start !== period.end) return `${period.start} → ${period.end}`
  return period.start ?? period.end ?? '—'
}

const exportSanitySnapshot = (result: ConversionResult): ExportSanitySnapshot => {
  const deposits = result.rows.reduce((sum, row) => sum + (row.deposit ?? 0), 0)
  const withdrawals = result.rows.reduce((sum, row) => sum + (row.withdrawal ?? 0), 0)
  const amountSum = result.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  const hasDebitCredit = result.rows.some((row) => row.deposit !== undefined || row.withdrawal !== undefined)
  const transactionNet = hasDebitCredit ? deposits - withdrawals : amountSum

  const openingBalance = result.validation.openingBalance
  const closingBalance = result.validation.closingBalance
  const hasBalanceTrail = openingBalance !== undefined && closingBalance !== undefined
  const netChange = hasBalanceTrail ? closingBalance - openingBalance : undefined
  const discrepancy = netChange !== undefined ? netChange - transactionNet : undefined

  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

  return {
    openingBalance,
    closingBalance,
    netChange: netChange !== undefined ? roundMoney(netChange) : undefined,
    deposits: roundMoney(deposits),
    withdrawals: roundMoney(withdrawals),
    transactionNet: roundMoney(transactionNet),
    discrepancy: discrepancy !== undefined ? roundMoney(discrepancy) : undefined,
    hasBalanceTrail,
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
  {
    question: 'Can I ask questions about the conversion?',
    answer:
      'Yes. Ask ExtractMint can explain validation issues, export choices, missing balances, and next review steps. It uses a built-in fallback by default and can connect to FreeLLMAPI through Vercel environment variables.',
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

function normalizePdfMatchText(value: string) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rowConfidencePercent(value: number | undefined) {
  if (value === undefined || value === null) return 0
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  const normalized = numeric <= 1 ? numeric * 100 : numeric
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function bestSnippetFromPageText(rawText: string, tokens: string[], maxChars = 96) {
  const text = (rawText ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  let bestIndex = Number.POSITIVE_INFINITY
  for (const token of tokens) {
    if (!token) continue
    const index = lower.indexOf(token)
    if (index >= 0 && index < bestIndex) bestIndex = index
  }
  if (!Number.isFinite(bestIndex)) return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text

  const halfWindow = Math.floor(maxChars / 2)
  const start = Math.max(0, bestIndex - halfWindow)
  const end = Math.min(text.length, bestIndex + halfWindow)
  const snippet = text.slice(start, end).trim()
  if (!snippet) return ''
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${snippet}${suffix}`
}

function tokenWeight(token: string) {
  if (!token) return 0
  const numeric = /^[0-9.]+$/.test(token)
  if (numeric) return 2
  if (token.length >= 5) return 2
  return 1
}

function bestMatchingPage(pages: ParsedPage[], row: ConversionResult['rows'][number] | undefined) {
  return rankMatchingPages(pages, row)[0]?.pageNumber ?? (pages[0]?.pageNumber ?? 1)
}

function rankMatchingPages(pages: ParsedPage[], row: ConversionResult['rows'][number] | undefined) {
  if (!row || pages.length === 0) return [{ pageNumber: pages[0]?.pageNumber ?? 1, score: 0 }]
  const dateHint = normalizeSearchText(row.date ?? '')
  const descHint = normalizeSearchText(row.description).split(' ').slice(0, 8).join(' ')
  if (!dateHint && !descHint) return [{ pageNumber: pages[0]?.pageNumber ?? 1, score: 0 }]

  const ranked: Array<{ pageNumber: number; score: number }> = []

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
    ranked.push({ pageNumber: page.pageNumber, score })
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
    .filter((item, index, all) => all.findIndex((other) => other.pageNumber === item.pageNumber) === index)
}

function clampPage(page: number, upperBound: number | null) {
  if (!Number.isFinite(page)) return 1
  const floored = Math.max(1, Math.floor(page))
  if (!upperBound || upperBound <= 0) return floored
  return Math.min(upperBound, floored)
}

function thumbnailPages(totalPages: number, activePage: number, maxThumbs = 12) {
  const safeTotal = Math.max(1, Math.floor(totalPages))
  const safeActive = clampPage(activePage, safeTotal)
  if (safeTotal <= maxThumbs) return Array.from({ length: safeTotal }, (_, index) => index + 1)

  const pages = new Set<number>()
  pages.add(1)
  pages.add(safeTotal)

  for (let delta = -3; delta <= 3; delta += 1) {
    pages.add(clampPage(safeActive + delta, safeTotal))
  }

  const needed = maxThumbs - pages.size
  if (needed > 0) {
    const step = (safeTotal - 1) / (needed + 1)
    for (let i = 1; i <= needed; i += 1) {
      pages.add(clampPage(1 + step * i, safeTotal))
    }
  }

  return Array.from(pages).sort((a, b) => a - b).slice(0, maxThumbs)
}

type PdfPageMatchCandidate = {
  pageNumber: number
  confidence: number
  matchedTokens: number
  totalTokens: number
  snippet: string
}

type TelemetryEvent = {
  at: string
  fileType: string
  fileSize: number
  shaPrefix?: string
  rows: number
  confidence: number
  validationStatus: ConversionResult['validation']['status']
  validationIssues: number
  hasBalanceTrail: boolean
  discrepancy?: number
  usedOcr: boolean
  forceOcr: boolean
  ocrLanguage: string
  persistOcrCache: boolean
  persistPdfTextIndex: boolean
}

const TELEMETRY_STORAGE_KEY = 'extractmint.telemetry.v1'

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<ConversionResult[]>([createSampleResultLite()])
  const [activeIndex, setActiveIndex] = useState(0)
  const [showAllRows, setShowAllRows] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(
    () => storedValue('extractmint.onlyLowConfidence') === '1',
  )
  const [lowConfidenceThreshold, setLowConfidenceThreshold] = useState(() => {
    const raw = storedValue('extractmint.lowConfidenceThreshold')
    const parsed = raw ? Number.parseInt(raw, 10) : 70
    return Number.isFinite(parsed) ? Math.max(1, Math.min(99, parsed)) : 70
  })
  const [editRows, setEditRows] = useState(false)
  const [showSourcePreview, setShowSourcePreview] = useState(
    () => storedValue('extractmint.showSourcePreview') === '1',
  )
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [forceOcr, setForceOcr] = useState(() => storedValue('extractmint.forceOcr') === '1')
  const [ocrLanguage, setOcrLanguage] = useState(() => storedValue('extractmint.ocrLanguage') || 'eng')
  const [persistOcrCache, setPersistOcrCache] = useState(() => storedValue('extractmint.persistOcrCache') !== '0')
  const [persistPdfTextIndex, setPersistPdfTextIndex] = useState(
    () => storedValue('extractmint.persistPdfTextIndex') !== '0',
  )
  const [ocrCacheStats, setOcrCacheStats] = useState<{ entries: number; bytes: number }>({ entries: 0, bytes: 0 })
  const [pdfTextIndexStats, setPdfTextIndexStats] = useState<{ entries: number; bytes: number }>({
    entries: 0,
    bytes: 0,
  })
  const [cacheClearStatus, setCacheClearStatus] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle')
  const [includeSourcesInReviewPack, setIncludeSourcesInReviewPack] = useState(
    () => storedValue('extractmint.reviewPackIncludeSources') === '1',
  )
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null)
  const [pdfThumbUrls, setPdfThumbUrls] = useState<Record<string, string>>({})
  const [pdfThumbStatus, setPdfThumbStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pdfUrlsBySha, setPdfUrlsBySha] = useState<Record<string, string>>({})
  const pdfUrlRef = useRef<Record<string, string>>({})
  const pdfDocRef = useRef<unknown>(null)
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null)
  const [pdfMatchInfo, setPdfMatchInfo] = useState<PdfMatchInfo | null>(null)
  const [pdfRowMatches, setPdfRowMatches] = useState<PdfPageMatchCandidate[]>([])
  const [pdfRowMatchStatus, setPdfRowMatchStatus] = useState<'idle' | 'indexing' | 'ready' | 'error'>('idle')
  const pdfTextIndexRef = useRef<Map<string, string>>(new Map())
  const pdfRawTextIndexRef = useRef<Map<string, string>>(new Map())
  const pdfRowMatchCacheRef = useRef<Map<string, PdfPageMatchCandidate[]>>(new Map())
  const [agentQuestion, setAgentQuestion] = useState('What should I check before exporting to Excel?')
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask me about validation issues, export formats, balance checks, or what to review before using the converted file.',
      provider: 'ready',
    },
  ])
  const [isAgentThinking, setIsAgentThinking] = useState(false)
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>(() => {
    const raw = storedValue(TELEMETRY_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(Boolean).slice(0, 50) as TelemetryEvent[]
    } catch {
      return []
    }
  })
  const [progress, setProgress] = useState<ProgressEvent>({
    fileName: 'sample-bank-statement.pdf',
    stage: 'ready',
    percent: 100,
    detail: 'Sample conversion loaded',
  })
  const conversionSawOcrRef = useRef(false)

  const appendTelemetry = (events: TelemetryEvent[]) => {
    if (events.length === 0) return
    setTelemetryEvents((previous) => {
      const next = [...events, ...previous].slice(0, 50)
      storeValue(TELEMETRY_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const clearTelemetry = () => {
    setTelemetryEvents([])
    storeValue(TELEMETRY_STORAGE_KEY, '[]')
  }

  const activeResult = results[activeIndex] ?? results[0]
  const activeSha = activeResult?.fileMeta?.sha256
  const activePdfUrl = activeSha ? pdfUrlsBySha[activeSha] : undefined
  const activePages = useMemo(() => parsePagesFromRawText(activeResult?.rawText ?? ''), [activeResult?.rawText])
  const activeThumbPages = useMemo(() => {
    if (!activeSha || !activePdfUrl || !showSourcePreview || !pdfPageCount) return []
    return thumbnailPages(pdfPageCount, pdfPage, 12)
  }, [activePdfUrl, activeSha, pdfPage, pdfPageCount, showSourcePreview])
  const selectedRow = selectedRowIndex !== null ? (activeResult?.rows?.[selectedRowIndex] ?? null) : null
  const pageCandidates = useMemo(() => {
    if (!selectedRow) return []
    if (pdfRowMatches.length > 0) {
      return pdfRowMatches
        .map((match) => ({ pageNumber: match.pageNumber, score: match.confidence }))
        .filter((item) => item.score > 0)
        .slice(0, 8)
    }
    return rankMatchingPages(activePages, selectedRow).filter((item) => item.score > 0).slice(0, 6)
  }, [activePages, pdfRowMatches, selectedRow])
  const pdfHighlightQueries = useMemo(() => {
    if (!selectedRow) return []
    const queries: string[] = []
    if (selectedRow.date) queries.push(selectedRow.date)

    const descWords = (selectedRow.description ?? '')
      .split(/\s+/g)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !/^[0-9.]+$/.test(word))
      .slice(0, 3)
    if (descWords.length) queries.push(descWords.join(' '))

    const addNumberQueries = (value?: number) => {
      if (value === undefined || !Number.isFinite(value)) return
      const fixed = Math.abs(value).toFixed(2)
      queries.push(fixed)
      const withCommas = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Math.abs(value),
      )
      queries.push(withCommas)
    }

    addNumberQueries(selectedRow.withdrawal)
    addNumberQueries(selectedRow.deposit)
    addNumberQueries(selectedRow.amount)
    return Array.from(new Set(queries)).slice(0, 6)
  }, [selectedRow])
  const pdfRowMatchQueriesKey = useMemo(
    () => (pdfHighlightQueries ?? []).map(normalizePdfMatchText).filter(Boolean).join('|'),
    [pdfHighlightQueries],
  )
  const agentContext = useMemo(() => {
    if (!activeResult) return null
    return {
      fileName: activeResult.fileName,
      documentKind: activeResult.summary.documentKind,
      rowCount: activeResult.rows.length,
      confidence: activeResult.confidence,
      currencyCode: activeResult.currencyCode,
      validationStatus: activeResult.validation.status,
      issueCount: activeResult.validation.issueCount,
      statementPeriod: statementPeriodLabel(activeResult.statementPeriod),
      sampleRows: activeResult.rows.slice(0, 5).map((row) => ({
        date: row.date,
        description: row.description,
        withdrawal: row.withdrawal,
        deposit: row.deposit,
        amount: row.amount,
        balance: row.balance,
        confidence: row.confidence,
      })),
    }
  }, [activeResult])

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

  useEffect(() => {
    if (!showSourcePreview || !activePdfUrl) {
      pdfDocRef.current = null
      setPdfDoc(null)
      setPdfPageCount(null)
      setPdfThumbStatus('idle')
      setPdfMatchInfo(null)
      setPdfRowMatches([])
      setPdfRowMatchStatus('idle')
      return
    }

    let cancelled = false
    pdfDocRef.current = null
    setPdfDoc(null)
    setPdfPageCount(null)
    setPdfThumbStatus('loading')

    void (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.mjs?url'),
        ])
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const response = await fetch(activePdfUrl)
        const buffer = await response.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buffer }).promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setPdfDoc(pdf as unknown as PdfDocumentProxy)
        setPdfPageCount(pdf.numPages)
        setPdfPage((current) => clampPage(current, pdf.numPages))
        setPdfThumbStatus('ready')
      } catch (error) {
        if (cancelled) return
        pdfDocRef.current = null
        setPdfDoc(null)
        setPdfPageCount(null)
        setPdfThumbStatus('error')
        setPdfRowMatches([])
        setPdfRowMatchStatus('error')
        console.warn('PDF preview load failed', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activePdfUrl, showSourcePreview])

  useEffect(() => {
    if (!showSourcePreview || !activeSha || !selectedRow || selectedRowIndex === null) {
      setPdfRowMatches([])
      setPdfRowMatchStatus('idle')
      return
    }
    if (!pdfDoc || !pdfPageCount) {
      setPdfRowMatches([])
      setPdfRowMatchStatus('idle')
      return
    }

    const cacheKey = `${activeSha}:${selectedRowIndex}:${pdfRowMatchQueriesKey}`
    const cached = pdfRowMatchCacheRef.current.get(cacheKey)
    if (cached) {
      setPdfRowMatches(cached)
      setPdfRowMatchStatus('ready')
      return
    }

    const queries = (pdfHighlightQueries ?? []).map(normalizePdfMatchText).filter(Boolean)
    const tokens = Array.from(
      new Set(
        queries
          .flatMap((query) => query.split(' '))
          .map((token) => token.trim())
          .filter((token) => token.length >= 2),
      ),
    )
    const totalWeight = tokens.reduce((sum, token) => sum + tokenWeight(token), 0)
    if (tokens.length === 0 || totalWeight <= 0) {
      setPdfRowMatches([])
      setPdfRowMatchStatus('idle')
      return
    }

    let cancelled = false
    setPdfRowMatchStatus('indexing')

    void (async () => {
      try {
        const matches: PdfPageMatchCandidate[] = []
	        for (let pageNumber = 1; pageNumber <= pdfPageCount; pageNumber += 1) {
	          if (cancelled) return
	          const pageKey = `${activeSha}:${pageNumber}`
	          let normalizedPageText = pdfTextIndexRef.current.get(pageKey)
	          let rawPageText = pdfRawTextIndexRef.current.get(pageKey) ?? ''
	          if (!normalizedPageText && persistPdfTextIndex) {
	            const persistent = await getPersistentPdfPageText(pageKey)
	            if (cancelled) return
	            if (persistent) {
	              rawPageText = persistent.rawText
	              normalizedPageText = persistent.normalizedText
	              pdfTextIndexRef.current.set(pageKey, normalizedPageText)
	              pdfRawTextIndexRef.current.set(pageKey, rawPageText)
	            }
	          }
	          if (!normalizedPageText) {
	            const page = await pdfDoc.getPage(pageNumber)
	            if (cancelled) return
	            const content = await page.getTextContent()
	            if (cancelled) return
	            const rawText = (content.items ?? [])
	              .map((item) => ('str' in item ? (item.str ?? '') : ''))
	              .join(' ')
	              .replace(/\s+/g, ' ')
	              .trim()
	            rawPageText = rawText
	            normalizedPageText = normalizePdfMatchText(rawText)
	            pdfTextIndexRef.current.set(pageKey, normalizedPageText)
	            pdfRawTextIndexRef.current.set(pageKey, rawText)
	            if (persistPdfTextIndex) {
	              void setPersistentPdfPageText(pageKey, rawText, normalizedPageText)
	            }
	          }

          if (!normalizedPageText) continue
          let matchedWeight = 0
          let matchedTokens = 0
          for (const token of tokens) {
            if (normalizedPageText.includes(token)) {
              matchedWeight += tokenWeight(token)
              matchedTokens += 1
            }
          }
          if (matchedWeight <= 0) continue

	          matches.push({
	            pageNumber,
	            confidence: Math.max(0, Math.min(100, Math.round((matchedWeight / totalWeight) * 100))),
	            matchedTokens,
	            totalTokens: tokens.length,
	            snippet: bestSnippetFromPageText(rawPageText, tokens, 90),
	          })
	        }

        if (cancelled) return
        const ranked = matches
          .sort((a, b) => b.confidence - a.confidence || a.pageNumber - b.pageNumber)
          .slice(0, 8)
        pdfRowMatchCacheRef.current.set(cacheKey, ranked)
        setPdfRowMatches(ranked)
        setPdfRowMatchStatus('ready')
        if (persistPdfTextIndex) {
          void (async () => {
            setPdfTextIndexStats(await getPersistentPdfTextIndexStats())
          })()
        }
      } catch (error) {
        if (cancelled) return
        console.warn('PDF row match indexing failed', error)
        setPdfRowMatches([])
        setPdfRowMatchStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    activeSha,
    pdfDoc,
    pdfHighlightQueries,
    pdfPageCount,
    pdfRowMatchQueriesKey,
	    selectedRow,
	    selectedRowIndex,
	    persistPdfTextIndex,
	    showSourcePreview,
	  ])

  useEffect(() => {
    if (!activeSha || !activePdfUrl || !showSourcePreview) return
    if (!pdfDoc || !pdfPageCount) return

    let cancelled = false

    void (async () => {
      const pagesToRender = thumbnailPages(pdfPageCount, pdfPage, 12)
      const missing = pagesToRender.filter((pageNumber) => !pdfThumbUrls[`${activeSha}:${pageNumber}`])
      if (missing.length === 0) return

      const nextThumbs: Record<string, string> = {}
      for (const pageNumber of missing) {
        if (cancelled) return
        try {
          const page = await pdfDoc.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 0.18 })
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))
          const context = canvas.getContext('2d')
          if (!context) continue
          await page.render({ canvasContext: context, canvas, viewport }).promise
          nextThumbs[`${activeSha}:${pageNumber}`] = canvas.toDataURL('image/jpeg', 0.72)
        } catch {
          // best-effort thumbnails
        }
      }

      if (cancelled) return
      if (Object.keys(nextThumbs).length === 0) return
      setPdfThumbUrls((previous) => ({ ...previous, ...nextThumbs }))
    })()

    return () => {
      cancelled = true
    }
  }, [activePdfUrl, activeSha, pdfDoc, pdfPage, pdfPageCount, pdfThumbUrls, showSourcePreview])

  const refreshOcrCacheStats = () => {
    if (!persistOcrCache) return
    void (async () => {
      setOcrCacheStats(await getPersistentOcrCacheStats())
    })()
  }

  const refreshPdfTextIndexStats = () => {
    if (!persistPdfTextIndex) return
    void (async () => {
      setPdfTextIndexStats(await getPersistentPdfTextIndexStats())
    })()
  }

  const clearAllLocalCaches = () => {
    void (async () => {
      if (cacheClearStatus === 'clearing') return
      setCacheClearStatus('clearing')
      try {
        await Promise.all([clearPersistentOcrCache(), clearPersistentPdfTextIndex()])

        pdfTextIndexRef.current.clear()
        pdfRawTextIndexRef.current.clear()
        pdfRowMatchCacheRef.current.clear()
        setPdfRowMatches([])
        setPdfMatchInfo(null)
        setPdfRowMatchStatus('idle')

        const converter = getConverterIfLoaded()
        converter?.clearInMemoryOcrCache()

        setOcrCacheStats({ entries: 0, bytes: 0 })
        setPdfTextIndexStats({ entries: 0, bytes: 0 })

        setCacheClearStatus('done')
        window.setTimeout(() => setCacheClearStatus('idle'), 2400)
      } catch {
        setCacheClearStatus('error')
        window.setTimeout(() => setCacheClearStatus('idle'), 3200)
      }
    })()
  }

  useEffect(() => {
    refreshOcrCacheStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistOcrCache])

  useEffect(() => {
    refreshPdfTextIndexStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistPdfTextIndex])

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
    const filteredIssues = onlyIssues
      ? indexed.filter(({ index }) => {
          const review = rowReview(result.validation, index)
          return review.status === 'Review' || review.status === 'Check'
        })
      : indexed
    const filteredConfidence = onlyLowConfidence
      ? filteredIssues.filter(({ row }) => rowConfidencePercent(row.confidence) < lowConfidenceThreshold)
      : filteredIssues
    return showAllRows ? filteredConfidence : filteredConfidence.slice(0, 8)
  }, [activeResult, lowConfidenceThreshold, onlyIssues, onlyLowConfidence, showAllRows])

  const lowConfidenceRowIndices = useMemo(() => {
    const result = activeResult
    if (!result) return []
    return result.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowConfidencePercent(row.confidence) < lowConfidenceThreshold)
      .map(({ index }) => index)
  }, [activeResult, lowConfidenceThreshold])
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
    const reviewPackZipFiles = files.filter((file) => file.name.toLowerCase().endsWith('.zip'))
    const normalFiles = files.filter((file) => {
      const name = file.name.toLowerCase()
      return !name.endsWith('.extractmint-review.json') && !name.endsWith('.zip')
    })

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
      for (let index = 0; index < reviewPackZipFiles.length; index += 1) {
        const file = reviewPackZipFiles[index]
        setProgress({
          fileName: file.name,
          stage: 'reading',
          percent: Math.round((index / Math.max(1, reviewPackZipFiles.length)) * 100),
          detail: 'Importing ExtractMint review pack ZIP',
        })
        try {
          const bundle = await converter.importReviewPackZip(file)
          imported.push(...bundle.results)
          const sources = bundle.sourcesBySha
          const sourceShas = Object.keys(sources)
          if (sourceShas.length > 0) {
            setPdfUrlsBySha((previous) => {
              const next: Record<string, string> = { ...previous }
              for (const sha of sourceShas) {
                const source = sources[sha]
                if (!source) continue
                const isPdf =
                  (source.mimeType || '').toLowerCase().includes('pdf') ||
                  (source.fileName || '').toLowerCase().endsWith('.pdf')
                if (!isPdf) continue
                const url = URL.createObjectURL(source.blob)
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
        } catch (error) {
          throw new Error(
            `Failed to import ${file.name}: ${error instanceof Error ? error.message : 'Invalid ZIP'}`,
            { cause: error },
          )
        }
      }
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

      conversionSawOcrRef.current = false
      const onConversionProgress = (event: ProgressEvent) => {
        if (event.stage === 'ocr') conversionSawOcrRef.current = true
        setProgress(event)
      }

      const converted =
        normalFiles.length === 0
          ? []
          : await converter.convertFiles(normalFiles, onConversionProgress, {
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
      if (converted.length > 0) {
        const usedOcr = forceOcr || conversionSawOcrRef.current
        appendTelemetry(
          converted.map((result) => {
            const snapshot = exportSanitySnapshot(result)
            return {
              at: new Date().toISOString(),
              fileType: result.fileType,
              fileSize: result.fileMeta.size,
              shaPrefix: result.fileMeta.sha256 ? result.fileMeta.sha256.slice(0, 10) : undefined,
              rows: result.rows.length,
              confidence: result.confidence,
              validationStatus: result.validation.status,
              validationIssues: result.validation.issueCount,
              hasBalanceTrail: snapshot.hasBalanceTrail,
              discrepancy: snapshot.discrepancy,
              usedOcr,
              forceOcr,
              ocrLanguage,
              persistOcrCache,
              persistPdfTextIndex,
            }
          }),
        )
      }
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
      const sourcesBySha: Record<string, { blob: Blob; fileName: string; mimeType: string }> = {}

      if (includeSourcesInReviewPack) {
        setProgress({
          fileName: `${results.length} files`,
          stage: 'exporting',
          percent: 88,
          detail: 'Collecting source PDFs for the review pack',
        })

        const uniqueShas = Array.from(
          new Set(
            results
              .map((result) => result.fileMeta.sha256)
              .filter((sha): sha is string => typeof sha === 'string' && sha.length > 0),
          ),
        )

        for (const sha256 of uniqueShas) {
          const url = pdfUrlsBySha[sha256]
          if (!url) continue
          try {
            const blob = await (await fetch(url)).blob()
            const result = results.find((candidate) => candidate.fileMeta.sha256 === sha256)
            sourcesBySha[sha256] = {
              blob,
              fileName: result?.fileName || `${sha256}.pdf`,
              mimeType: blob.type || 'application/pdf',
            }
          } catch {
            // ignore fetch failures
          }
        }
      }

      const blob = await converter.createReviewPackZipBlob(results, sourcesBySha)
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

  const downloadDiagnostic = () => {
    if (!activeResult) return
    void (async () => {
      const converter = await loadConverter()
      const blob = converter.createPrivacySafeDiagnosticBlob(activeResult)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const sha = activeResult.fileMeta.sha256
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `extractmint-diagnostic-${sha ? sha.slice(0, 10) : stamp}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    })()
  }

  const copySupportRequest = () => {
    if (!activeResult) return
    void (async () => {
      const converter = await loadConverter()
      const diagnostic = converter.createPrivacySafeDiagnostic(activeResult)
      const payload = {
        app: 'ExtractMint',
        origin: window.location.origin,
        at: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
        file: {
          type: activeResult.fileType,
          size: activeResult.fileMeta.size,
          sha256Prefix: activeResult.fileMeta.sha256 ? activeResult.fileMeta.sha256.slice(0, 10) : undefined,
        },
        diagnostic,
      }

      const body = [
        'Hi ExtractMint Support,',
        '',
        'I have a statement format that ExtractMint is not extracting correctly.',
        '',
        'Privacy-safe diagnostic payload (no statement text/rows/filenames):',
        '',
        JSON.stringify(payload, null, 2),
        '',
        'Notes:',
        '- If you need more context, I can also share a redacted PDF sample.',
        '- I can attach the separate Diagnostic JSON download if requested.',
        '',
        'Thanks!',
      ].join('\n')

      try {
        await navigator.clipboard.writeText(body)
        setProgress({
          fileName: activeResult.fileName,
          stage: 'complete',
          percent: 100,
          detail: 'Support request copied (paste into email; attach Diagnostic JSON if requested).',
        })
      } catch (error) {
        setProgress({
          fileName: activeResult.fileName,
          stage: 'error',
          percent: 100,
          detail: error instanceof Error ? error.message : 'Failed to copy support request',
        })
      }
    })()
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

  const askAgent = async () => {
    const question = agentQuestion.trim()
    if (!question || isAgentThinking) return

    setAgentMessages((previous) => [...previous, { role: 'user', content: question }])
    setAgentQuestion('')
    setIsAgentThinking(true)

    try {
      const response = await fetch('/api/agent/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: agentContext,
        }),
      })
      const payload = (response.headers.get('content-type') || '').includes('application/json')
        ? ((await response.json()) as {
        answer?: string
        provider?: string
        warning?: string
        error?: string
          })
        : {}

      if (!response.ok) {
        throw new Error(payload.error || 'Agent request failed')
      }

      setAgentMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content: payload.answer || 'I could not generate an answer for that question.',
          provider: payload.provider,
          warning: payload.warning,
        },
      ])
    } catch (error) {
      setAgentMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content:
            'The agent API is not reachable in this environment. On Vercel, it will answer with the local fallback immediately, and it can use FreeLLMAPI once the gateway environment variables are set.',
          provider: 'offline',
          warning: error instanceof Error ? error.message : 'Agent request failed',
        },
      ])
    } finally {
      setIsAgentThinking(false)
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
          <a href="#agent">Agent</a>
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
            <a className="secondary-button" href="/pricing/">
              <Tag size={18} />
              Pricing
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
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.docx,.txt,.csv,.xlsx,.xls,.zip,.extractmint-review.json"
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
              <small>or click to choose PDFs, images, or ExtractMint review packs (.zip)</small>
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
		              <label className="ocr-cache-row">
		                <input
		                  type="checkbox"
		                  checked={persistPdfTextIndex}
	                  onChange={(event) => {
	                    const next = event.target.checked
	                    setPersistPdfTextIndex(next)
	                    storeValue('extractmint.persistPdfTextIndex', next ? '1' : '0')
	                  }}
	                />
	                Persist PDF review index (faster row matching)
	                {persistPdfTextIndex ? (
	                  <span className="ocr-cache-meta">
	                    {pdfTextIndexStats.entries} pages saved · {Math.round(pdfTextIndexStats.bytes / 1024)} KB
	                    <button
	                      type="button"
	                      className="link-button"
	                      onClick={() => {
	                        void (async () => {
	                          await clearPersistentPdfTextIndex()
	                          refreshPdfTextIndexStats()
	                        })()
	                      }}
	                    >
	                      Clear
	                    </button>
	                  </span>
		                ) : null}
		              </label>

                  <details className="privacy-panel">
                    <summary>Trust &amp; privacy (local-only processing)</summary>
                    <div className="privacy-panel-body">
                      <p>
                        ExtractMint reads files in your browser in this static build. Nothing is uploaded unless you later add a server-side
                        conversion backend.
                      </p>
                      <ul>
                        <li>
                          <strong>Optional local caches:</strong> “Persist OCR cache” and “Persist PDF review index” store derived text in your
                          browser (IndexedDB) for faster repeat exports and row matching.
                        </li>
                        <li>
                          <strong>Review packs are exports:</strong> downloaded review JSON/ZIP can contain extracted rows (and optionally source
                          PDFs) so treat them like financial documents.
                        </li>
                        <li>
                          <strong>Support diagnostics are privacy-safe:</strong> the Diagnostic JSON contains only counts/signals (no statement
                          text or transactions) so you can share it when a bank format fails.
                        </li>
                        <li>
                          <strong>Clear anytime:</strong> remove cached OCR + PDF index data from this browser with one click.
                        </li>
                      </ul>
                      <div className="privacy-actions">
                        <button type="button" onClick={clearAllLocalCaches} disabled={cacheClearStatus === 'clearing'}>
                          {cacheClearStatus === 'clearing'
                            ? 'Clearing local caches…'
                            : cacheClearStatus === 'done'
                              ? 'Cleared'
                              : cacheClearStatus === 'error'
                                ? 'Clear failed (retry)'
                                : 'Clear all local caches'}
                        </button>
                        <small>
                          Clears persistent OCR + PDF index caches (and in-memory review caches) for this browser profile.
                        </small>
                      </div>
                    </div>
                  </details>

                  <details className="privacy-panel">
                    <summary>Support &amp; telemetry (local-only, no PII)</summary>
                    <div className="privacy-panel-body">
                      <p>
                        Telemetry stays in your browser and only stores counts/signals (no statement text, rows, or filenames). Use it to spot
                        patterns like “OCR needed” or “balance discrepancy”.
                      </p>
                      <div className="privacy-actions">
                        <button type="button" onClick={copySupportRequest} disabled={!activeResult}>
                          Copy support request (privacy-safe)
                        </button>
                        <small>
                          Copies a pre-filled support request (JSON) to your clipboard. Paste into email and optionally attach the Diagnostic
                          export.
                        </small>
                        <button type="button" onClick={clearTelemetry} disabled={telemetryEvents.length === 0}>
                          Clear telemetry history
                        </button>
                      </div>
                      {telemetryEvents.length > 0 ? (
                        <ul>
                          {telemetryEvents.slice(0, 8).map((event, index) => (
                            <li key={`${event.at}-${event.shaPrefix ?? index}`}>
                              <strong>{new Date(event.at).toLocaleString()}</strong> — {event.fileType} · {event.rows} rows ·{' '}
                              {Math.round(event.confidence * 100)}% confidence · {event.validationStatus}
                              {event.hasBalanceTrail && event.discrepancy !== undefined
                                ? ` · discrepancy ${event.discrepancy.toFixed(2)}`
                                : ''}
                              {event.usedOcr ? ' · OCR' : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </details>
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
	              <button
	                onClick={downloadDiagnostic}
	                disabled={!activeResult}
	                title="Downloads a privacy-safe diagnostic JSON (no transactions) to help support new bank formats."
	              >
	                <Tag size={16} />
	                Diagnostic
	              </button>
	              <button
	                onClick={copySupportRequest}
	                disabled={!activeResult}
	                title="Copies a pre-filled, privacy-safe support request to your clipboard (no statement text/rows/filename)."
	              >
	                <Copy size={16} />
	                Support copy
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

            {activeResult ? (
              <div className="export-sanity" aria-label="Export sanity checks">
                {(() => {
                  const snapshot = exportSanitySnapshot(activeResult)
                  const okThreshold = 0.02
                  const status =
                    snapshot.discrepancy === undefined
                      ? { label: 'Not enough balance data', className: 'is-missing' }
                      : Math.abs(snapshot.discrepancy) <= okThreshold
                        ? { label: 'Matches balance trail', className: 'is-valid' }
                        : { label: 'Discrepancy — review', className: 'is-review' }

                  return (
                    <div className={`export-sanity-card ${status.className}`}>
                      <div className="export-sanity-header">
                        <div>
                          <strong>Export sanity checks</strong>
                          <small>Compares opening/closing balances to extracted transaction totals.</small>
                        </div>
                        <span className="export-sanity-status">{status.label}</span>
                      </div>
                      <div className="export-sanity-grid">
                        <div>
                          <span>Opening balance</span>
                          <strong>{formatAmount(snapshot.openingBalance, activeResult.currencyCode)}</strong>
                        </div>
                        <div>
                          <span>Closing balance</span>
                          <strong>{formatAmount(snapshot.closingBalance, activeResult.currencyCode)}</strong>
                        </div>
                        <div>
                          <span>Net change</span>
                          <strong>{formatAmount(snapshot.netChange, activeResult.currencyCode)}</strong>
                        </div>
                        <div>
                          <span>Transaction net</span>
                          <strong>{formatAmount(snapshot.transactionNet, activeResult.currencyCode)}</strong>
                        </div>
                        <div>
                          <span>Total deposits</span>
                          <strong>{formatAmount(snapshot.deposits, activeResult.currencyCode)}</strong>
                        </div>
                        <div>
                          <span>Total withdrawals</span>
                          <strong>{formatAmount(snapshot.withdrawals, activeResult.currencyCode)}</strong>
                        </div>
                        <div className="export-sanity-discrepancy">
                          <span>Discrepancy</span>
                          <strong>{formatAmount(snapshot.discrepancy, activeResult.currencyCode)}</strong>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : null}

            <div className="export-options" aria-label="Review pack options">
              <label title="Include the original statement PDFs inside the review pack ZIP so PDF previews work when you import later (larger download).">
                <input
                  type="checkbox"
                  checked={includeSourcesInReviewPack}
                  onChange={(event) => {
                    const next = event.target.checked
                    setIncludeSourcesInReviewPack(next)
                    storeValue('extractmint.reviewPackIncludeSources', next ? '1' : '0')
                  }}
                />
                Include source PDFs in review pack ZIP
              </label>
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

                <div
                  className={
                    showSourcePreview && activeResult?.fileType === 'application/pdf' ? 'review-split' : undefined
                  }
                >
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
                          checked={onlyLowConfidence}
                          onChange={(event) => {
                            const next = event.target.checked
                            setOnlyLowConfidence(next)
                            storeValue('extractmint.onlyLowConfidence', next ? '1' : '0')
                          }}
                        />
                        Low-confidence rows
                      </label>
                      <label className="table-inline-control" aria-label="Low confidence threshold">
                        <span>Threshold</span>
                        <select
                          value={String(lowConfidenceThreshold)}
                          onChange={(event) => {
                            const next = Math.max(1, Math.min(99, Number.parseInt(event.target.value, 10) || 70))
                            setLowConfidenceThreshold(next)
                            storeValue('extractmint.lowConfidenceThreshold', String(next))
                          }}
                          disabled={!onlyLowConfidence}
                        >
                          {[50, 60, 70, 75, 80, 85, 90].map((value) => (
                            <option key={value} value={String(value)}>
                              {value}%
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="table-action"
                        disabled={lowConfidenceRowIndices.length === 0}
                        onClick={() => {
                          if (!activeResult) return
                          const current = selectedRowIndex ?? -1
                          const nextIndex =
                            lowConfidenceRowIndices.find((index) => index > current) ?? lowConfidenceRowIndices[0]
                          if (nextIndex === undefined) return
                          setSelectedRowIndex(nextIndex)
                          const row = activeResult.rows[nextIndex]
                          setPdfPage(bestMatchingPage(activePages, row))
                        }}
                        aria-label="Jump to next low-confidence row"
                        title={
                          lowConfidenceRowIndices.length > 0
                            ? `${lowConfidenceRowIndices.length} row(s) below ${lowConfidenceThreshold}%`
                            : `No rows below ${lowConfidenceThreshold}%`
                        }
                      >
                        Next low-confidence ({lowConfidenceRowIndices.length})
                      </button>
                      <label>
                        <input
                          type="checkbox"
                          checked={editRows}
                          onChange={(event) => setEditRows(event.target.checked)}
                        />
                        Edit values
                      </label>
                      {activeResult?.fileType === 'application/pdf' ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={showSourcePreview}
                            onChange={(event) => {
                              const next = event.target.checked
                              setShowSourcePreview(next)
                              storeValue('extractmint.showSourcePreview', next ? '1' : '0')
                            }}
                          />
                          Show source PDF
                        </label>
                      ) : null}
                      <span className="table-hint">
                        {editRows
                          ? 'Edits instantly re-check the running balance trail.'
                          : activeResult?.fileType === 'application/pdf' && !showSourcePreview
                            ? 'Tip: enable “Show source PDF” to audit rows faster.'
                            : 'Click a row to jump to the most likely page.'}
                      </span>
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

                  {showSourcePreview && activeResult?.fileType === 'application/pdf' ? (
                    <aside className="source-preview" aria-label="Source PDF preview">
                      <div className="source-header">
                        <div>
                          <span>Source PDF</span>
                          <strong>{activeResult.fileName}</strong>
                        </div>
	                        <div className="page-controls">
	                          <button
	                            type="button"
	                            onClick={() => setPdfPage((p) => clampPage(p - 1, pdfPageCount))}
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
	                                if (Number.isFinite(next) && next > 0) setPdfPage(clampPage(next, pdfPageCount))
	                              }}
	                            />
	                          </label>
	                          {pdfPageCount ? <span className="page-total">of {pdfPageCount}</span> : null}
	                          <button
	                            type="button"
	                            onClick={() => setPdfPage((p) => clampPage(p + 1, pdfPageCount))}
	                            aria-label="Next page"
	                          >
	                            Next
	                          </button>
	                        </div>
	                      </div>

	                      {activePdfUrl ? (
	                        <div className="pdf-thumbnails" aria-label="PDF page thumbnails">
	                          {activeThumbPages.map((pageNumber) => {
	                            const key = `${activeSha ?? 'unknown'}:${pageNumber}`
	                            const url = pdfThumbUrls[key]
	                            const isActive = pageNumber === pdfPage
	                            return (
	                              <button
	                                key={key}
	                                type="button"
	                                className={isActive ? 'active' : ''}
	                                onClick={() => setPdfPage(clampPage(pageNumber, pdfPageCount))}
	                                aria-label={`Jump to page ${pageNumber}`}
	                              >
	                                {url ? <img src={url} alt={`Page ${pageNumber}`} loading="lazy" /> : <span />}
	                                <small>{pageNumber}</small>
	                              </button>
	                            )
	                          })}
	                          {pdfThumbStatus === 'loading' ? (
	                            <div className="thumb-status" aria-label="Loading thumbnails">
	                              Loading thumbnails…
	                            </div>
	                          ) : null}
	                        </div>
	                      ) : null}

	                      {activePdfUrl ? (
	                        pdfDoc ? (
	                          <PdfCanvasViewer
	                            pdf={pdfDoc}
	                            pageNumber={pdfPage}
	                            highlightQueries={pdfHighlightQueries}
	                            onMatchInfo={setPdfMatchInfo}
	                            scrollToMatchKey={
	                              selectedRowIndex !== null ? `${activeSha ?? 'unknown'}:${selectedRowIndex}:${pdfPage}` : undefined
	                            }
	                          />
	                        ) : (
	                          <div className="pdf-canvas-fallback" aria-label="Loading PDF">
	                            Loading PDF…
	                          </div>
	                        )
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
                        <div>Click a row to jump to the most likely page (best-effort text match).</div>
                        {selectedRow && pdfMatchInfo ? (
                          <div className="pdf-match-meta">
                            <span className="pdf-match-pill" aria-label="PDF match confidence">
                              Match {pdfMatchInfo.confidence}% ({pdfMatchInfo.matchedTokens}/{pdfMatchInfo.totalTokens})
                            </span>
                            {pdfRowMatchStatus === 'indexing' ? (
                              <span className="pdf-match-pill" aria-label="Searching PDF pages">
                                Searching pages…
                              </span>
                            ) : null}
                            {pdfRowMatches.length > 1 ? (
                              <span className="pdf-match-pages" aria-label="Other possible pages">
                                Also on{' '}
                                {pdfRowMatches.map((match, index) => (
                                  <button
                                    key={`${match.pageNumber}-${match.confidence}`}
                                    type="button"
                                    className={`pdf-match-page ${match.pageNumber === pdfPage ? 'is-active' : ''}`}
                                    onClick={() => setPdfPage(clampPage(match.pageNumber, pdfPageCount))}
                                    title={
                                      match.snippet
                                        ? `p${match.pageNumber} · ${match.confidence}%\n${match.snippet}`
                                        : `p${match.pageNumber} · ${match.confidence}%`
                                    }
                                  >
                                    p{match.pageNumber}
                                    {index === 0 ? '' : ` (${match.confidence}%)`}
                                  </button>
                                ))}
                              </span>
                            ) : null}
                            <span className="pdf-match-snippet" title={pdfMatchInfo.snippet}>
                              {pdfMatchInfo.snippet ? `“${pdfMatchInfo.snippet}”` : null}
                            </span>
                            {pageCandidates.length > 1 ? (
                              <button
                                type="button"
                                className="pdf-match-copy"
                                onClick={() => {
                                  const currentIndex = pageCandidates.findIndex((item) => item.pageNumber === pdfPage)
                                  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % pageCandidates.length : 0
                                  setPdfPage(clampPage(pageCandidates[nextIndex]?.pageNumber ?? 1, pdfPageCount))
                                }}
                              >
                                Next match
                              </button>
                            ) : null}
                            {pdfMatchInfo.snippet ? (
                              <button
                                type="button"
                                className="pdf-match-copy"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(pdfMatchInfo.snippet)
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                Copy snippet
                              </button>
                            ) : null}
                          </div>
                        ) : null}
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

      <section className="agent-section" id="agent">
        <div className="section-heading">
          <span className="eyebrow">Ask ExtractMint</span>
          <h2>An AI review assistant for every converted document.</h2>
        </div>
        <div className="agent-panel">
          <div className="agent-brief">
            <span className="agent-icon">
              <Bot size={24} />
            </span>
            <h3>Ask what to check next</h3>
            <p>
              The agent answers questions about the active file, validation status,
              sample rows, export choices, and reconciliation steps.
            </p>
            <div className="agent-source">
              <Sparkles size={16} />
              <span>FreeLLMAPI-ready via Vercel environment variables</span>
            </div>
          </div>
          <div className="agent-chat" aria-live="polite">
            <div className="agent-messages">
              {agentMessages.map((message, index) => (
                <motion.div
                  key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                  className={`agent-message ${message.role}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <p>{message.content}</p>
                  {message.provider ? <small>{message.provider}</small> : null}
                  {message.warning ? <small>{message.warning}</small> : null}
                </motion.div>
              ))}
              {isAgentThinking ? (
                <div className="agent-message assistant">
                  <p>Reading the conversion context...</p>
                  <small>working</small>
                </div>
              ) : null}
            </div>
            <form
              className="agent-input"
              onSubmit={(event) => {
                event.preventDefault()
                void askAgent()
              }}
            >
              <input
                value={agentQuestion}
                onChange={(event) => setAgentQuestion(event.target.value)}
                placeholder="Ask about accuracy, exports, or balance issues..."
                maxLength={1200}
              />
              <button type="submit" disabled={isAgentThinking || !agentQuestion.trim()}>
                <SendHorizontal size={17} />
                Ask
              </button>
            </form>
          </div>
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
        <div className="footer-links" aria-label="Site links">
          <a href="/pricing/">Pricing</a>
          <a href="/privacy/">Privacy</a>
          <a href="/security/">Security</a>
          <a href="/llms.txt">LLMs.txt</a>
        </div>
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
