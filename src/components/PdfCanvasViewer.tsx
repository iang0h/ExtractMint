import { useEffect, useMemo, useRef, useState } from 'react'

type Transform = readonly number[]

type PdfTextItem = {
  str?: string
  transform?: Transform
  width?: number
  height?: number
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
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
}

type HighlightBox = { x: number; y: number; width: number; height: number }

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

function buildHighlights(items: PdfTextItem[], viewport: { scale: number; transform: Transform }, queries: string[]) {
  const normalizedQueries = queries.map(normalizeQuery).filter(Boolean)
  if (normalizedQueries.length === 0) return [] as HighlightBox[]

  const boxes: HighlightBox[] = []
  for (const item of items) {
    const str = item.str
    if (!str || !item.transform) continue
    const normalizedText = normalizeQuery(str)
    if (!normalizedText) continue
    const matches = normalizedQueries.some((query) => normalizedText.includes(query))
    if (!matches) continue

    const combined = multiplyTransform(viewport.transform, item.transform)
    const x = combined[4]
    const y = combined[5]
    const width = Math.max(1, (item.width ?? 0) * viewport.scale)
    const height = Math.max(8, Math.hypot(combined[1], combined[3]))
    boxes.push({
      x,
      y: y - height,
      width,
      height,
    })
  }

  return boxes.slice(0, 24)
}

export function PdfCanvasViewer({
  pdf,
  pageNumber,
  highlightQueries,
}: {
  pdf: PdfDocumentProxy
  pageNumber: number
  highlightQueries?: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle')
  const [boxes, setBoxes] = useState<HighlightBox[]>([])

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
        const nextBoxes = highlightQueries?.length
          ? buildHighlights(content.items ?? [], { scale, transform: viewport.transform }, highlightQueries)
          : []
        setBoxes(nextBoxes)
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

  return (
    <div ref={containerRef} className="pdf-canvas-viewer" aria-label="Rendered PDF preview">
      <div className="pdf-canvas-stage">
        <canvas ref={canvasRef} />
        {boxes.length ? (
          <div className="pdf-highlights" aria-hidden="true">
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
