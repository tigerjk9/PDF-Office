'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import type { PdfPage } from '@/lib/types'
import type { PageBox } from '@/lib/pdf/page-box'

interface PageSlotProps {
  page: PdfPage
  /** 미리 계산된 박스(부모가 computePageBox로 산출) */
  box: PageBox
  /** 공유 pdfjs 문서(doc-cache). null이면 아직 로드 전 → 썸네일만 */
  doc: PDFDocumentProxy | null
  /** 0-based 페이지 인덱스 */
  pageIndex: number
  /** 뷰포트 근접 여부(IntersectionObserver). true일 때만 캔버스 렌더 */
  visible: boolean
  /** 활성 문서 bytes(폴백 렌더용) */
  bytes: Uint8Array
}

/**
 * 연속 뷰어의 페이지 1개 슬롯.
 *  - 박스 크기를 즉시 예약 → 스크롤 중 레이아웃 점프 0
 *  - visible && doc 일 때만 캔버스 렌더(윈도잉). 그 외엔 page.thumbnail
 *  - 렌더 실패는 이 슬롯에만 인라인 표시 + 재시도(전체 뷰어 영향 0)
 */
export function PageSlot({
  page,
  box,
  doc,
  pageIndex,
  visible,
  bytes,
}: PageSlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<{ cancel: () => void } | null>(null)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!visible || !canvasRef.current) return
    let disposed = false
    handleRef.current?.cancel()
    setError(null)

    const handle = renderPageToCanvas(bytes, pageIndex, canvasRef.current, {
      scale: box.scale,
      rotation: page.rotation,
      doc: doc ?? undefined,
    })
    handleRef.current = handle

    handle.promise
      .then(() => {
        if (!disposed) setRendered(true)
      })
      .catch((err: unknown) => {
        if (disposed) return
        if (
          err &&
          (err as { name?: string }).name === 'RenderingCancelledException'
        ) {
          return
        }
        setError(err instanceof Error ? err.message : '렌더링 실패')
      })

    return () => {
      disposed = true
      handle.cancel()
    }
  }, [visible, doc, bytes, pageIndex, box.scale, page.rotation, retryKey])

  return (
    <div
      data-page-index={pageIndex}
      className="relative flex-shrink-0 rounded-sm bg-background shadow-md ring-1 ring-border"
      style={{ width: box.w, height: box.h }}
      aria-label={`${pageIndex + 1}페이지`}
    >
      {/* 비가시: 썸네일 자리표시(이미 존재). 가시: 캔버스 */}
      {!visible && page.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.thumbnail}
          alt={`${pageIndex + 1}페이지 미리보기`}
          className="h-full w-full rounded-sm object-contain"
          draggable={false}
        />
      )}
      {!visible && !page.thumbnail && (
        <div className="skeleton-shimmer h-full w-full rounded-sm" aria-hidden />
      )}
      {visible && (
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-sm"
          aria-hidden
        />
      )}
      {visible && !rendered && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>렌더링 중…</span>
          </span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-sm bg-background/95 p-4 text-center"
        >
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {pageIndex + 1}페이지 렌더 실패
          </p>
          <button
            type="button"
            onClick={() => {
              setRendered(false)
              setRetryKey((k) => k + 1)
            }}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}
