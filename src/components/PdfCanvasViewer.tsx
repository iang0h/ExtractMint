import { useEffect, useMemo, useRef, useState } from 'react'

type Transform = readonly number[]

type PdfTextItem = {
  str?: string
  transform?: Transform
  width?: number
  height?: number
}

export type PdfMatchInfo = {
  confidence: number
  snippet: string
  matchedTokens: number
  totalTokens: number
}

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => {
    width: number
    height: number
    transform: Transform
  }
  getTextContent: () => Promise<{ items: PdfTextItem[] }>
  render: (options: {
    canvasContext: CanvasRenderingContext2D
    canvas: HTMLCanvasElement
    viewport: unknown
  }) => { promise: Promise<unknown>; cancel?: () => void }
}

export type PdfDocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
}

type HighlightBox = { x: number; y: number; width: number; height: number }

type HighlightResult = {
  boxes: HighlightBox[]
  primaryBox: HighlightBox | null
  matchInfo: PdfMatchInfo | null
}

function multiplyTransform(m1: Transform, m2: Transform): [number, number, number, number, number, number] {
  const a1 = m1[0] ?? 1
  const b1 = m1[1] ?? 0
  const c1 = m1[2] ?? 0
  const d1 = m1[3] ?? 1
  const e1 = m1[4] ?? 0
  const f1 = m1[5] ?? 0
  const a2 = m2[0] ?? 1
  const b2 = m2[1] ?? 0
  const c2 = m2[2] ?? 0
  const d2 = m2[3] ?? 1
  const e2 = m2[4] ?? 0
  const f2 = m2[5] ?? 0
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function normalizeQuery(text: string) {
  return text.trim().toLowerCase()
}

function normalizeForMatch(value: string) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenWeight(token: string) {
  if (!token) return 0
  const numeric = /^[0-9.]+$/.test(token)
  if (numeric) return 2
  if (token.length >= 5) return 2
  return 1
}

function buildHighlights(
  items: PdfTextItem[],
  viewport: { scale: number; transform: Transform },
  queries: string[],
): HighlightResult {
  const normalizedQueries = queries.map(normalizeForMatch).filter(Boolean)
  if (normalizedQueries.length === 0) return { boxes: [], primaryBox: null, matchInfo: null }

  const tokens = Array.from(
    new Set(
      normalizedQueries
        .flatMap((query) => query.split(' '))
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  )
  const totalWeight = tokens.reduce((sum, token) => sum + tokenWeight(token), 0)
  if (tokens.length === 0 || totalWeight <= 0) return { boxes: [], primaryBox: null, matchInfo: null }

  const normalizedItems = items.map((item) => normalizeForMatch(item.str ?? ''))
  const rawItems = items.map((item) => (item.str ?? '').replace(/\s+/g, ' ').trim())

  const windowRadius = 2
  let bestIndex = -1
  let bestScore = -1
  let bestMatchedWeight = 0
  let bestWindowText = ''

  for (let index = 0; index < items.length; index += 1) {
    const start = Math.max(0, index - windowRadius)
    const end = Math.min(items.length - 1, index + windowRadius)
    const windowText = normalizedItems.slice(start, end + 1).filter(Boolean).join(' ')
    if (!windowText) continue

    let matchedWeight = 0
    for (const token of tokens) {
      if (windowText.includes(token)) matchedWeight += tokenWeight(token)
    }

    if (matchedWeight > bestScore) {
      bestScore = matchedWeight
      bestMatchedWeight = matchedWeight
      bestIndex = index
      bestWindowText = rawItems.slice(start, end + 1).filter(Boolean).join(' ')
    }
  }

  if (bestIndex < 0 || bestScore <= 0) return { boxes: [], primaryBox: null, matchInfo: null }

  const highlightIndices = new Set<number>()
  const windowStart = Math.max(0, bestIndex - windowRadius)
  const windowEnd = Math.min(items.length - 1, bestIndex + windowRadius)
  for (let index = windowStart; index <= windowEnd; index += 1) {
    const normalized = normalizedItems[index]
    if (!normalized) continue
    const matches = tokens.some((token) => normalized.includes(token))
    if (matches) highlightIndices.add(index)
  }

  const rects: HighlightBox[] = []
  for (const index of highlightIndices) {
    const item = items[index]
    if (!item?.transform) continue
    const combined = multiplyTransform(viewport.transform, item.transform)
    const x = combined[4]
    const y = combined[5]
    const width = Math.max(1, (item.width ?? 0) * viewport.scale)
    const height = Math.max(8, Math.hypot(combined[1], combined[3]))
    rects.push({
      x,
      y: y - height,
      width,
      height,
    })
  }

  const primaryBox =
    rects.length > 0
      ? rects.reduce(
          (acc, rect) => {
            const nextX = Math.min(acc.x, rect.x)
            const nextY = Math.min(acc.y, rect.y)
            const right = Math.max(acc.x + acc.width, rect.x + rect.width)
            const bottom = Math.max(acc.y + acc.height, rect.y + rect.height)
            return { x: nextX, y: nextY, width: right - nextX, height: bottom - nextY }
          },
          { ...rects[0] },
        )
      : null

  const mergedBoxes: HighlightBox[] = []
  if (rects.length > 0) {
    const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
    const yTolerance = 6
    const xGapTolerance = 10
    for (const rect of sorted) {
      const last = mergedBoxes[mergedBoxes.length - 1]
      if (
        last &&
        Math.abs(rect.y - last.y) <= yTolerance &&
        rect.x <= last.x + last.width + xGapTolerance
      ) {
        const nextX = Math.min(last.x, rect.x)
        const nextY = Math.min(last.y, rect.y)
        const right = Math.max(last.x + last.width, rect.x + rect.width)
        const bottom = Math.max(last.y + last.height, rect.y + rect.height)
        last.x = nextX
        last.y = nextY
        last.width = right - nextX
        last.height = bottom - nextY
      } else {
        mergedBoxes.push({ ...rect })
      }
    }
  }

  const snippet = bestWindowText.slice(0, 160)
  const totalTokens = tokens.length
  const matchedTokens = tokens.reduce((sum, token) => (normalizeForMatch(bestWindowText).includes(token) ? sum + 1 : sum), 0)
  const confidence = Math.max(0, Math.min(100, Math.round((bestMatchedWeight / totalWeight) * 100)))
  return {
    boxes: mergedBoxes.slice(0, 24),
    primaryBox,
    matchInfo: {
      confidence,
      snippet,
      matchedTokens,
      totalTokens,
    },
  }
}

export function PdfCanvasViewer({
  pdf,
  pageNumber,
  highlightQueries,
  onMatchInfo,
  scrollToMatchKey,
}: {
  pdf: PdfDocumentProxy
  pageNumber: number
  highlightQueries?: string[]
  onMatchInfo?: (info: PdfMatchInfo | null) => void
  scrollToMatchKey?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle')
  const [boxes, setBoxes] = useState<HighlightBox[]>([])
  const [primaryBox, setPrimaryBox] = useState<HighlightBox | null>(null)

  const queriesKey = useMemo(() => (highlightQueries ?? []).map(normalizeQuery).filter(Boolean).join('|'), [highlightQueries])

  useEffect(() => {
    if (!pdf || !pageNumber) return
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let cancelled = false
    let lastTask: { cancel?: () => void } | null = null
    const render = async () => {
      setRenderStatus('rendering')
      setBoxes([])
      setPrimaryBox(null)
      onMatchInfo?.(null)
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return

        const baseViewport = page.getViewport({ scale: 1 })
        const containerWidth = Math.max(1, container.clientWidth)
        const scale = Math.max(0.25, Math.min(3.5, containerWidth / baseViewport.width))
        const viewport = page.getViewport({ scale })

        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context unavailable')

        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        lastTask?.cancel?.()
        const task = page.render({ canvasContext: ctx, canvas, viewport })
        lastTask = task
        await task.promise
        if (cancelled) return

        const content = await page.getTextContent()
        if (cancelled) return
        const { boxes: nextBoxes, matchInfo, primaryBox } = highlightQueries?.length
          ? buildHighlights(content.items ?? [], { scale, transform: viewport.transform }, highlightQueries)
          : { boxes: [], matchInfo: null, primaryBox: null }
        setBoxes(nextBoxes)
        setPrimaryBox(primaryBox)
        onMatchInfo?.(matchInfo)
        setRenderStatus('ready')
      } catch (error) {
        if (cancelled) return
        console.warn('PDF render failed', error)
        setRenderStatus('error')
      }
    }

    const observer = new ResizeObserver(() => {
      void render()
    })
    observer.observe(container)
    void render()

    return () => {
      cancelled = true
      lastTask?.cancel?.()
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, queriesKey])

  useEffect(() => {
    if (!scrollToMatchKey) return
    const container = containerRef.current
    if (!container || !primaryBox) return
    const target = Math.max(0, primaryBox.y + primaryBox.height / 2 - container.clientHeight / 2)
    container.scrollTo({ top: target, behavior: 'smooth' })
  }, [scrollToMatchKey, primaryBox])

  return (
    <div ref={containerRef} className="pdf-canvas-viewer" aria-label="Rendered PDF preview">
      <div className="pdf-canvas-stage">
        <canvas ref={canvasRef} />
        {boxes.length ? (
          <div className="pdf-highlights" aria-hidden="true">
            {primaryBox ? (
              <div
                className="pdf-highlight pdf-highlight-primary"
                style={{
                  left: `${primaryBox.x}px`,
                  top: `${primaryBox.y}px`,
                  width: `${primaryBox.width}px`,
                  height: `${primaryBox.height}px`,
                }}
              />
            ) : null}
            {boxes.map((box, index) => (
              <div
                key={`${box.x}-${box.y}-${box.width}-${box.height}-${index}`}
                className="pdf-highlight"
                style={{
                  left: `${box.x}px`,
                  top: `${box.y}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {renderStatus === 'rendering' ? <div className="pdf-canvas-status">Rendering…</div> : null}
      {renderStatus === 'error' ? <div className="pdf-canvas-status">Unable to render this PDF page.</div> : null}
    </div>
  )
}
