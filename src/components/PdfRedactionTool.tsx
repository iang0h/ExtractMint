import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { PdfDocumentProxy } from './PdfCanvasViewer'

type RedactionRectPx = { x: number; y: number; width: number; height: number }
type RedactionRectPct = { x: number; y: number; width: number; height: number }

function normalizeRect(rect: RedactionRectPx): RedactionRectPx | null {
  const x1 = rect.x
  const y1 = rect.y
  const x2 = rect.x + rect.width
  const y2 = rect.y + rect.height
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  if (width < 6 || height < 6) return null
  return { x: left, y: top, width, height }
}

function clampRectToCanvas(rect: RedactionRectPx, canvas: HTMLCanvasElement): RedactionRectPx {
  const x = Math.max(0, Math.min(canvas.width, rect.x))
  const y = Math.max(0, Math.min(canvas.height, rect.y))
  const width = Math.max(0, Math.min(canvas.width - x, rect.width))
  const height = Math.max(0, Math.min(canvas.height - y, rect.height))
  return { x, y, width, height }
}

function pxToPctRect(rect: RedactionRectPx, canvas: HTMLCanvasElement): RedactionRectPct {
  const width = Math.max(1, canvas.width)
  const height = Math.max(1, canvas.height)
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
  return {
    x: clamp01(rect.x / width),
    y: clamp01(rect.y / height),
    width: clamp01(rect.width / width),
    height: clamp01(rect.height / height),
  }
}

function pctToPxRect(rect: RedactionRectPct, canvas: HTMLCanvasElement): RedactionRectPx {
  return {
    x: rect.x * canvas.width,
    y: rect.y * canvas.height,
    width: rect.width * canvas.width,
    height: rect.height * canvas.height,
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  redactions: RedactionRectPct[],
  draft: RedactionRectPx | null,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  for (const rect of redactions) {
    const px = pctToPxRect(rect, ctx.canvas)
    ctx.fillStyle = '#0b0b0c'
    ctx.fillRect(px.x, px.y, px.width, px.height)
  }

  if (draft) {
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(draft.x, draft.y, draft.width, draft.height)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(draft.x + 0.5, draft.y + 0.5, Math.max(0, draft.width - 1), Math.max(0, draft.height - 1))
    ctx.restore()
  }
}

export function PdfRedactionTool({
  pdf,
  pageNumber,
  fileName,
}: {
  pdf: PdfDocumentProxy
  pageNumber: number
  fileName: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

  const [currentPage, setCurrentPage] = useState(Math.max(1, Math.floor(pageNumber || 1)))
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle')
  const [redactionsByPage, setRedactionsByPage] = useState<Record<number, RedactionRectPct[]>>({})
  const [draft, setDraft] = useState<RedactionRectPx | null>(null)
  const [dragging, setDragging] = useState<{ startX: number; startY: number } | null>(null)
  const [zipPagesInput, setZipPagesInput] = useState<string>('current')
  const [zipStatus, setZipStatus] = useState<string | null>(null)
  const zipBusyRef = useRef(false)

  const safeBaseName = useMemo(() => (fileName ?? 'statement').replace(/\.[^.]+$/, ''), [fileName])
  const pageCount = pdf?.numPages ?? null

  const redactions = useMemo(() => redactionsByPage[currentPage] ?? [], [redactionsByPage, currentPage])

  useEffect(() => {
    if (!pdf || !currentPage) return
    const container = containerRef.current
    const baseCanvas = baseCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!container || !baseCanvas || !overlayCanvas) return

    let cancelled = false
    let lastTask: { cancel?: () => void } | null = null

    const render = async () => {
      setRenderStatus('rendering')
      try {
        const page = await pdf.getPage(currentPage)
        if (cancelled) return

        const baseViewport = page.getViewport({ scale: 1 })
        const containerWidth = Math.max(1, container.clientWidth)
        const scale = Math.max(0.25, Math.min(3.5, containerWidth / baseViewport.width))
        const viewport = page.getViewport({ scale })

        const width = Math.max(1, Math.floor(viewport.width))
        const height = Math.max(1, Math.floor(viewport.height))
        baseCanvas.width = width
        baseCanvas.height = height
        overlayCanvas.width = width
        overlayCanvas.height = height

        const ctx = baseCanvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context unavailable')
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, width, height)

        lastTask?.cancel?.()
        const task = page.render({ canvasContext: ctx, canvas: baseCanvas, viewport })
        lastTask = task
        await task.promise
        if (cancelled) return

        setRenderStatus('ready')

        const overlayCtx = overlayCanvas.getContext('2d')
        if (overlayCtx) {
          drawOverlay(overlayCtx, redactions, draft)
        }
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
  }, [pdf, currentPage])

  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return
    const ctx = overlayCanvas.getContext('2d')
    if (!ctx) return
    drawOverlay(ctx, redactions, draft)
  }, [redactions, draft])

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * (canvas.width / rect.width)))
    const y = Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * (canvas.height / rect.height)))
    canvas.setPointerCapture(event.pointerId)
    setDragging({ startX: x, startY: y })
    setDraft({ x, y, width: 1, height: 1 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas || !dragging) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * (canvas.width / rect.width)))
    const y = Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * (canvas.height / rect.height)))
    setDraft({ x: dragging.startX, y: dragging.startY, width: x - dragging.startX, height: y - dragging.startY })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }

    const normalized = draft ? normalizeRect(draft) : null
    setDragging(null)
    setDraft(null)
    if (!normalized) return
    const clamped = clampRectToCanvas(normalized, canvas)
    if (clamped.width < 6 || clamped.height < 6) return
    const pct = pxToPctRect(clamped, canvas)
    setRedactionsByPage((previous) => {
      const existing = previous[currentPage] ?? []
      return { ...previous, [currentPage]: [...existing, pct].slice(0, 32) }
    })
  }

  const undo = () => {
    setRedactionsByPage((previous) => {
      const existing = previous[currentPage] ?? []
      if (existing.length === 0) return previous
      return { ...previous, [currentPage]: existing.slice(0, -1) }
    })
  }
  const clear = () => {
    setRedactionsByPage((previous) => {
      if (!previous[currentPage]?.length) return previous
      return { ...previous, [currentPage]: [] }
    })
  }

  const parsePagesSpec = (spec: string): number[] => {
    if (!pageCount) return [currentPage]
    const trimmed = spec.trim().toLowerCase()
    if (!trimmed || trimmed === 'current') return [currentPage]
    if (trimmed === 'all') return Array.from({ length: pageCount }, (_, index) => index + 1)

    const pages = new Set<number>()
    for (const part of trimmed.split(',').map((p) => p.trim()).filter(Boolean)) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map((t) => Number.parseInt(t.trim(), 10))
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
        const start = Math.max(1, Math.min(pageCount, Math.min(a, b)))
        const end = Math.max(1, Math.min(pageCount, Math.max(a, b)))
        for (let p = start; p <= end; p += 1) pages.add(p)
        continue
      }
      const n = Number.parseInt(part, 10)
      if (!Number.isFinite(n)) continue
      if (n < 1 || n > pageCount) continue
      pages.add(n)
    }
    return [...pages].sort((a, b) => a - b)
  }

  const renderRedactedPngBlob = async (targetPage: number): Promise<Blob | null> => {
    const page = await pdf.getPage(targetPage)
    const viewport = page.getViewport({ scale: 2 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, canvas, viewport }).promise

    const rects = redactionsByPage[targetPage] ?? []
    if (rects.length > 0) {
      ctx.fillStyle = '#0b0b0c'
      for (const rect of rects) {
        const px = pctToPxRect(rect, canvas)
        ctx.fillRect(px.x, px.y, px.width, px.height)
      }
    }

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  const download = () => {
    const baseCanvas = baseCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!baseCanvas || !overlayCanvas) return
    if (baseCanvas.width <= 1 || baseCanvas.height <= 1) return

    const output = document.createElement('canvas')
    output.width = baseCanvas.width
    output.height = baseCanvas.height
    const ctx = output.getContext('2d')
    if (!ctx) return
    ctx.drawImage(baseCanvas, 0, 0)
    ctx.drawImage(overlayCanvas, 0, 0)

    output.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeBaseName}-redacted-p${currentPage}.png`
      anchor.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  const downloadZip = () => {
    if (!pageCount) return
    if (zipBusyRef.current) return
    zipBusyRef.current = true
    setZipStatus('Preparing ZIP…')

    void (async () => {
      try {
        const pages = parsePagesSpec(zipPagesInput)
        if (pages.length === 0) {
          setZipStatus('No valid pages selected. Use: current, all, or e.g. 1-3,5')
          return
        }

        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        for (let index = 0; index < pages.length; index += 1) {
          const pageNumber = pages[index]!
          setZipStatus(`Rendering page ${pageNumber} (${index + 1}/${pages.length})…`)
          const blob = await renderRedactedPngBlob(pageNumber)
          if (!blob) throw new Error('Failed to render redacted PNG')
          zip.file(`${safeBaseName}-redacted-p${pageNumber}.png`, blob)
        }

        setZipStatus('Compressing ZIP…')
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
        const url = URL.createObjectURL(zipBlob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${safeBaseName}-redacted-pages.zip`
        anchor.click()
        URL.revokeObjectURL(url)
        setZipStatus('ZIP downloaded.')
      } catch (error) {
        console.warn('ZIP export failed', error)
        setZipStatus('ZIP export failed. Try fewer pages or refresh and retry.')
      } finally {
        zipBusyRef.current = false
        window.setTimeout(() => setZipStatus(null), 4000)
      }
    })()
  }

  const clampPage = (value: number) => {
    const max = pageCount ?? 1
    return Math.max(1, Math.min(max, Math.floor(value)))
  }

  return (
    <div className="redaction-tool" aria-label="PDF redaction helper">
      <div className="redaction-header">
        <div>
          <strong>Redact page {currentPage}</strong>
          <small>Drag to add black boxes. Review carefully before sharing.</small>
        </div>
        <div className="redaction-actions">
          <button type="button" onClick={download} disabled={renderStatus !== 'ready'}>
            Download redacted PNG
          </button>
          <button type="button" onClick={downloadZip} disabled={renderStatus !== 'ready' || !pageCount}>
            Download ZIP
          </button>
          <button type="button" onClick={undo} disabled={redactions.length === 0}>
            Undo
          </button>
          <button type="button" onClick={clear} disabled={redactions.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <div className="redaction-controls" aria-label="Redaction export options">
        <div className="redaction-page-nav">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => clampPage(p - 1))}
            disabled={renderStatus === 'rendering' || currentPage <= 1}
          >
            Prev
          </button>
          <label>
            Page
            <input
              type="number"
              min={1}
              max={pageCount ?? 1}
              value={String(currentPage)}
              onChange={(event) => setCurrentPage(clampPage(Number(event.target.value)))}
            />
            {pageCount ? <span className="page-total">of {pageCount}</span> : null}
          </label>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => clampPage(p + 1))}
            disabled={renderStatus === 'rendering' || (pageCount ? currentPage >= pageCount : true)}
          >
            Next
          </button>
        </div>
        <label className="redaction-zip-pages">
          ZIP pages
          <input
            type="text"
            value={zipPagesInput}
            onChange={(event) => setZipPagesInput(event.target.value)}
            placeholder="current | all | 1-3,5"
            aria-label="Pages to include in ZIP"
          />
        </label>
        {zipStatus ? <div className="redaction-zip-status">{zipStatus}</div> : null}
      </div>

      <div ref={containerRef} className="redaction-stage" aria-label="Redaction canvas">
        <div className="redaction-canvas-stage">
          <canvas ref={baseCanvasRef} aria-hidden="true" />
          <canvas
            ref={overlayCanvasRef}
            className="redaction-overlay"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        {renderStatus === 'rendering' ? <div className="redaction-status">Rendering…</div> : null}
        {renderStatus === 'error' ? <div className="redaction-status">Unable to render this PDF page.</div> : null}
      </div>

      <div className="redaction-footer">
        <span>{redactions.length} redaction box{redactions.length === 1 ? '' : 'es'}</span>
        <span>Client-side only; nothing is uploaded.</span>
      </div>
    </div>
  )
}
