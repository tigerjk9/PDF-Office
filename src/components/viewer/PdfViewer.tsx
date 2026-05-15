'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

/**
 * 단일 페이지 Canvas 렌더러.
 * - activeDoc + viewer.currentPageIndex + viewer.zoom + rotation을 구독한다.
 * - 변경 시 pdfjs로 캔버스를 다시 그린다 (Effect cleanup으로 race condition 방지).
 *
 * fit-mode 처리:
 *  - fit-width: 컨테이너 폭에 맞춰 scale 계산
 *  - fit-page : 컨테이너 높이/폭 중 작은 쪽 기준
 *  - null     : viewer.zoom 그대로 사용
 */
export function PdfViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  const activeDoc = usePdfStore(selectActiveDoc)
  const pageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)

  const page = activeDoc?.pages[pageIndex]

  useEffect(() => {
    if (!activeDoc || !page || !canvasRef.current || !containerRef.current) return

    let cancelled = false

    const render = async () => {
      setIsRendering(true)
      setRenderError(null)
      try {
        let scale = zoom
        if (fitMode && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          const padding = 48 // 컨테이너 padding 보정
          const availW = Math.max(rect.width - padding, 100)
          const availH = Math.max(rect.height - padding, 100)
          // page.width/height는 PDF 좌표계(pt) — pdfjs viewport scale=1 기준
          if (fitMode === 'fit-width') {
            scale = availW / page.width
          } else if (fitMode === 'fit-page') {
            scale = Math.min(availW / page.width, availH / page.height)
          }
        }

        if (cancelled || !canvasRef.current) return
        await renderPageToCanvas(activeDoc.bytes, pageIndex, canvasRef.current, {
          scale,
          rotation: page.rotation,
        })
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Render failed')
        }
      } finally {
        if (!cancelled) setIsRendering(false)
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [activeDoc, page, pageIndex, zoom, fitMode])

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
      className="flex h-full w-full items-start justify-center overflow-auto p-6"
      role="region"
      aria-label="PDF 뷰어"
    >
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          className="block bg-white shadow-lg"
          aria-label={`${activeDoc.pageCount}페이지 중 ${pageIndex + 1}페이지`}
        />
        {isRendering && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-white/60"
            aria-live="polite"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
            <span className="sr-only">페이지를 렌더링하는 중</span>
          </div>
        )}
        {renderError && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-4 text-center text-sm text-destructive"
          >
            <AlertCircle className="h-5 w-5" aria-hidden />
            <p className="font-medium">페이지를 렌더링하지 못했습니다</p>
            <p className="text-xs text-muted-foreground">{renderError}</p>
          </div>
        )}
      </div>
    </div>
  )
}
