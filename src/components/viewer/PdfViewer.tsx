'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertCircle, TextCursorInput } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TextEditLayer } from '@/components/viewer/TextEditLayer'

/**
 * 단일 페이지 Canvas 렌더러.
 *
 * 로딩 안정화 (R2-6):
 *  (b) 페이지 종횡비로 캔버스 영역(흰 페이지 박스)을 즉시 예약 → pdfjs 가
 *      그 안에 페인트하므로 렌더 완료 전/후 레이아웃 점프 없음.
 *  (c) fit-mode 컨테이너 리사이즈는 ResizeObserver + 디바운스로 thrash 제거.
 *      zoom/fit/rotation/페이지가 실제로 바뀌지 않으면 재렌더하지 않는다.
 *  - 로딩/에러 표시는 절대 위치 오버레이로 → CLS 0.
 */
export function PdfViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  /** 진행 중 렌더 핸들 — 새 렌더 전에 cancel() (캔버스 다중 render 충돌 방지) */
  const renderHandleRef = useRef<{ cancel: () => void } | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  /** 텍스트 편집 모드 (UI 전용 — 스토어 비결합) */
  const [textEditMode, setTextEditMode] = useState(false)
  /** 디바운스된 컨테이너 크기 (fit-mode 재계산 트리거) */
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const activeDoc = usePdfStore(selectActiveDoc)
  const pageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)

  const page = activeDoc?.pages[pageIndex]

  // ResizeObserver + 디바운스: 리사이즈 폭주 시 마지막 1회만 반영 (R2-6 c)
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
        // 값이 실제로 바뀌지 않으면 상태 갱신 생략 → 불필요 재렌더 방지
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
    // 초기 1회 측정
    measure()

    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [])

  // 표시될 페이지 박스 크기(px) — 렌더 전에도 동일 계산으로 미리 예약 (R2-6 b)
  const boxSize = useMemo(() => {
    if (!page) return null
    const pad = 48 // 컨테이너 padding 보정 (p-6 = 24*2)
    const availW = Math.max(containerSize.w - pad, 100)
    const availH = Math.max(containerSize.h - pad, 100)

    // 회전 시 종횡비가 바뀜 (90/270 → width/height 스왑)
    const rotated = page.rotation === 90 || page.rotation === 270
    const pw = rotated ? page.height : page.width
    const ph = rotated ? page.width : page.height

    let scale = zoom
    if (fitMode === 'fit-width') {
      scale = availW / pw
    } else if (fitMode === 'fit-page') {
      scale = Math.min(availW / pw, availH / ph)
    }
    return {
      w: Math.max(Math.round(pw * scale), 1),
      h: Math.max(Math.round(ph * scale), 1),
      scale,
    }
  }, [page, zoom, fitMode, containerSize.w, containerSize.h])

  useEffect(() => {
    if (!activeDoc || !page || !canvasRef.current || !boxSize) return

    let disposed = false

    // 이전 렌더가 진행 중이면 먼저 취소 — 같은 canvas 다중 render() 금지
    // (새로고침 직후 rehydrate + ResizeObserver 로 빠르게 재실행될 때 충돌).
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
    <div className="flex h-full w-full flex-col">
      {/* 텍스트 편집 모드 토글 (R3-2) — 뷰어 상단의 얇은 구획 */}
      <div
        className="flex h-9 flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3"
        role="toolbar"
        aria-label="뷰어 편집 모드"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={textEditMode ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTextEditMode((v) => !v)}
                aria-label="텍스트 편집 모드 토글"
                aria-pressed={textEditMode}
              >
                <TextCursorInput className="h-4 w-4" />
                <span>텍스트 편집</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {textEditMode
                ? '텍스트 편집 모드 끄기'
                : '페이지의 텍스트를 클릭해 직접 수정'}
            </TooltipContent>
          </Tooltip>
          {textEditMode && (
            <span className="hidden truncate text-2xs text-muted-foreground sm:inline">
              텍스트 영역을 클릭해 수정하세요 · 완벽한 글꼴/배치 재현은 아닙니다
            </span>
          )}
        </div>
        <span className="flex-shrink-0 text-2xs tabular-nums text-muted-foreground">
          {pageIndex + 1} / {activeDoc.pageCount}
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 w-full flex-1 items-start justify-center overflow-auto p-6"
        role="region"
        aria-label="PDF 뷰어"
      >
        {/* 페이지 박스를 종횡비 크기로 즉시 예약 → 렌더 전/후 점프 없음 (R2-6 b) */}
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
            <AlertCircle
              className="h-5 w-5 text-destructive"
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">
              페이지를 렌더링하지 못했습니다
            </p>
            <p className="max-w-[28ch] text-xs text-muted-foreground">
              {renderError}
            </p>
          </div>
        )}

        {/* 텍스트 편집 오버레이 (R3-2) — 렌더 완료 후에만 표시 */}
        {textEditMode &&
          boxSize &&
          page &&
          !isRendering &&
          !renderError && (
            <TextEditLayer
              doc={activeDoc}
              pageIndex={pageIndex}
              rotation={page.rotation}
              box={{ w: boxSize.w, h: boxSize.h, scale: boxSize.scale }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
