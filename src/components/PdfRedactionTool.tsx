import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { PdfDocumentProxy } from './PdfCanvasViewer'

type RedactionRect = { x: number; y: number; width: number; height: number }

function normalizeRect(rect: RedactionRect): RedactionRect | null {
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

function clampRectToCanvas(rect: RedactionRect, canvas: HTMLCanvasElement): RedactionRect {
  const x = Math.max(0, Math.min(canvas.width, rect.x))
  const y = Math.max(0, Math.min(canvas.height, rect.y))
  const width = Math.max(0, Math.min(canvas.width - x, rect.width))
  const height = Math.max(0, Math.min(canvas.height - y, rect.height))
  return { x, y, width, height }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  redactions: RedactionRect[],
  draft: RedactionRect | null,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  for (const rect of redactions) {
    ctx.fillStyle = '#0b0b0c'
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
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

  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle')
  const [redactions, setRedactions] = useState<RedactionRect[]>([])
  const [draft, setDraft] = useState<RedactionRect | null>(null)
  const [dragging, setDragging] = useState<{ startX: number; startY: number } | null>(null)

  const safeBaseName = useMemo(() => (fileName ?? 'statement').replace(/\.[^.]+$/, ''), [fileName])

  useEffect(() => {
    if (!pdf || !pageNumber) return
    const container = containerRef.current
    const baseCanvas = baseCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!container || !baseCanvas || !overlayCanvas) return

    let cancelled = false
    let lastTask: { cancel?: () => void } | null = null

    const render = async () => {
      setRenderStatus('rendering')
      try {
        const page = await pdf.getPage(pageNumber)
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
  }, [pdf, pageNumber])

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
    setRedactions((previous) => [...previous, clamped].slice(0, 32))
  }

  const undo = () => setRedactions((previous) => previous.slice(0, -1))
  const clear = () => setRedactions([])

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
      anchor.download = `${safeBaseName}-redacted-p${pageNumber}.png`
      anchor.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="redaction-tool" aria-label="PDF redaction helper">
      <div className="redaction-header">
        <div>
          <strong>Redact page {pageNumber}</strong>
          <small>Drag to add black boxes. Review carefully before sharing.</small>
        </div>
        <div className="redaction-actions">
          <button type="button" onClick={download} disabled={renderStatus !== 'ready'}>
            Download redacted PNG
          </button>
          <button type="button" onClick={undo} disabled={redactions.length === 0}>
            Undo
          </button>
          <button type="button" onClick={clear} disabled={redactions.length === 0}>
            Clear
          </button>
        </div>
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
