'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import { computePageBox } from '@/lib/pdf/page-box'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

/**
 * 단일 페이지 Canvas 렌더러 (보기 모드 'single').
 *
 * 기존 PdfViewer 로직을 동작 변경 없이 이전한 것이다(회귀 최소화).
 *  - 페이지 종횡비로 캔버스 박스를 즉시 예약 → 레이아웃 점프 0
 *  - ResizeObserver + 디바운스로 fit-mode 재계산 thrash 제거
 *  - 로딩/에러는 절대 위치 오버레이 → CLS 0
 */
export function SinglePageViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const renderHandleRef = useRef<{ cancel: () => void } | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const activeDoc = usePdfStore(selectActiveDoc)
  const pageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)

  const page = activeDoc?.pages[pageIndex]

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const measure = () => {
      const rect = el.getBoundingClientRect()
      setContainerSize((prev) => {
        const next = {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        }
        if (prev.w === next.w && prev.h === next.h) return prev
        return next
      })
    }

    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(measure)
      }, 120)
    })
    ro.observe(el)
    measure()

    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [])

  const boxSize = useMemo(() => {
    if (!page) return null
    return computePageBox(page, {
      zoom,
      fitMode,
      availW: containerSize.w,
      availH: containerSize.h,
    })
  }, [page, zoom, fitMode, containerSize.w, containerSize.h])

  useEffect(() => {
    if (!activeDoc || !page || !canvasRef.current || !boxSize) return

    let disposed = false
    renderHandleRef.current?.cancel()

    setIsRendering(true)
    setRenderError(null)

    const handle = renderPageToCanvas(
      activeDoc.bytes,
      pageIndex,
      canvasRef.current,
      { scale: boxSize.scale, rotation: page.rotation },
    )
    renderHandleRef.current = handle

    handle.promise
      .then(() => {
        if (!disposed) setIsRendering(false)
      })
      .catch((err: unknown) => {
        if (disposed) return
        if (err && (err as { name?: string }).name === 'RenderingCancelledException') {
          return
        }
        setRenderError(err instanceof Error ? err.message : '렌더링 실패')
        setIsRendering(false)
      })

    return () => {
      disposed = true
      handle.cancel()
    }
  }, [activeDoc, page, pageIndex, boxSize])

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        선택된 문서가 없습니다
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-1 items-start justify-center overflow-auto p-6"
      role="region"
      aria-label="PDF 뷰어"
    >
      <div
        className="relative flex-shrink-0 rounded-sm bg-background shadow-md ring-1 ring-border"
        style={
          boxSize
            ? { width: boxSize.w, height: boxSize.h }
            : { aspectRatio: '1 / 1.414', width: 'min(60%, 480px)' }
        }
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-sm"
          aria-label={`${activeDoc.pageCount}페이지 중 ${pageIndex + 1}페이지`}
        />
        {isRendering && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>렌더링 중…</span>
            </span>
          </div>
        )}
        {renderError && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-sm bg-background/95 p-4 text-center"
          >
            <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              페이지를 렌더링하지 못했습니다
            </p>
            <p className="max-w-[28ch] text-xs text-muted-foreground">
              {renderError}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
