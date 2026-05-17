'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { computePageBox } from '@/lib/pdf/page-box'
import { acquirePdfDoc, releasePdfDoc } from '@/lib/pdf/doc-cache'
import { PageSlot } from '@/components/viewer/PageSlot'
import { useViewerScrollSync } from '@/hooks/useViewerScrollSync'

/** 뷰포트 기준 ±이만큼의 화면을 미리 렌더(프리페치) */
const PREFETCH_SCREENS = 1.5

/**
 * 연속 스크롤 뷰어 (보기 모드 'continuous').
 *  - 모든 페이지를 박스 예약된 PageSlot 으로 세로 나열
 *  - IntersectionObserver 로 뷰포트 근접 슬롯만 캔버스 렌더(윈도잉)
 *  - 공유 pdfjs 문서(doc-cache)로 재파싱 0
 *  - 스크롤 ↔ currentPageIndex 양방향 동기화(useViewerScrollSync)
 */
export function ContinuousViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [visible, setVisible] = useState<Set<number>>(new Set())
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)

  const activeDoc = usePdfStore(selectActiveDoc)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)

  const bytes = activeDoc?.bytes ?? null

  // 공유 pdfjs 문서 수명: bytes 변경/언마운트 시 acquire/release
  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      return
    }
    let alive = true
    acquirePdfDoc(bytes)
      .then((d) => {
        if (alive) setDoc(d)
      })
      .catch(() => {
        if (alive) setDoc(null) // 폴백: PageSlot 이 bytes 로 직접 로드
      })
    return () => {
      alive = false
      releasePdfDoc(bytes)
      setDoc(null)
    }
  }, [bytes])

  // 컨테이너 크기 측정(fit-width 계산용)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      const r = el.getBoundingClientRect()
      setContainerSize((p) => {
        const n = { w: Math.round(r.width), h: Math.round(r.height) }
        return p.w === n.w && p.h === n.h ? p : n
      })
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // 페이지별 박스(연속 모드는 fit-page 미지원 → fit-width/zoom만; pad=0)
  const pages = activeDoc?.pages ?? []
  const boxes = useMemo(() => {
    return pages.map((p) =>
      computePageBox(p, {
        zoom,
        fitMode: fitMode === 'fit-page' ? 'fit-width' : fitMode,
        availW: containerSize.w,
        availH: containerSize.h,
        pad: 48,
      }),
    )
  }, [pages, zoom, fitMode, containerSize.w, containerSize.h])

  // IntersectionObserver 윈도잉
  useEffect(() => {
    const el = containerRef.current
    if (!el || pages.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev)
          for (const e of entries) {
            const idx = Number(
              (e.target as HTMLElement).dataset.pageIndex,
            )
            if (e.isIntersecting) next.add(idx)
            else next.delete(idx)
          }
          return next
        })
      },
      {
        root: el,
        rootMargin: `${Math.round(PREFETCH_SCREENS * 100)}% 0px`,
        threshold: 0.01,
      },
    )
    const slots = el.querySelectorAll<HTMLElement>('[data-page-index]')
    slots.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [pages.length, activeDoc?.id])

  useViewerScrollSync({
    containerRef,
    currentPageIndex,
    pageCount: pages.length,
    onPageChange: setCurrentPage,
  })

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
      className="flex h-full w-full flex-1 flex-col items-center gap-4 overflow-auto p-6"
      role="region"
      aria-label="PDF 뷰어 (연속)"
    >
      {pages.map((p, i) => (
        <PageSlot
          key={`${activeDoc.id}-${p.index}`}
          page={p}
          box={boxes[i]}
          doc={doc}
          pageIndex={p.index}
          visible={visible.has(p.index)}
          bytes={activeDoc.bytes}
        />
      ))}
    </div>
  )
}
