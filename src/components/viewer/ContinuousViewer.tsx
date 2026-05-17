'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { computePageBox } from '@/lib/pdf/page-box'
import { acquirePdfDoc, releasePdfDoc } from '@/lib/pdf/doc-cache'
import { PageSlot } from '@/components/viewer/PageSlot'
import { useViewerScrollSync } from '@/hooks/useViewerScrollSync'
import { groupIntoRows } from '@/lib/pdf/spread'

/** 뷰포트 기준 ±이만큼의 화면을 미리 렌더(프리페치) */
const PREFETCH_SCREENS = 1.5

/** 2페이지(2-up) 열 사이 간격(px) — Tailwind gap-4=16 와 일치 */
const SPREAD_GAP = 16

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
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const setZoom = usePdfStore((s) => s.setZoom)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

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

  // 페이지별 박스(연속 모드는 fit-page 미지원 → fit-width/zoom만; 컨테이너 p-6=48 보정)
  // spread(2열): 열당 가용폭 perCol = floor((컨테이너폭 - p-6 48 - gap 16) / 2),
  // pad=0(perCol이 이미 padding 차감값). 1열은 기존과 동일 인자 → 회귀 0.
  const pages = activeDoc?.pages ?? []
  const cols = viewMode === 'spread' ? 2 : 1
  const boxes = useMemo(() => {
    const perCol = Math.floor((containerSize.w - 48 - SPREAD_GAP) / 2)
    return pages.map((p) =>
      computePageBox(p, {
        zoom,
        fitMode: fitMode === 'fit-page' ? 'fit-width' : fitMode,
        availW: cols === 2 ? perCol : containerSize.w,
        availH: containerSize.h,
        pad: cols === 2 ? 0 : 48,
      }),
    )
  }, [pages, zoom, fitMode, containerSize.w, containerSize.h, viewMode])

  // 2-up 행 그룹: 페이지 배열 위치 인덱스를 cols 단위로 묶는다.
  // cols=1 → [[0],[1],…](기존 연속과 동일 시각), cols=2 → [[0,1],[2,3],…].
  // boxes[i]는 pages[i]와 위치 정렬돼 있으므로 위치 인덱스로 그룹핑한다.
  const rows = useMemo(
    () => groupIntoRows(pages.map((_, i) => i), cols),
    [pages, cols],
  )

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
    // viewMode 포함 필수: continuous↔spread 전환 시 행 그룹/키가 바뀌어
    // PageSlot이 리마운트된다. viewMode 미포함 시 IO가 재실행되지 않아
    // 리마운트된 새 슬롯을 관찰하지 못함 → 윈도잉 정지(전 페이지 썸네일 고착).
  }, [pages.length, activeDoc?.id, viewMode])

  useViewerScrollSync({
    containerRef,
    currentPageIndex,
    pageCount: pages.length,
    onPageChange: setCurrentPage,
  })

  // Ctrl/⌘ + 휠 → 줌. 일반 휠은 네이티브 스크롤 유지.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const dir = e.deltaY < 0 ? 1 : -1
      const next = +(zoomRef.current + dir * 0.1).toFixed(2)
      setZoom(Math.max(0.25, Math.min(4.0, next)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  // 콘텐츠가 컨테이너보다 넓을 때 드래그 팬(grab/grabbing)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let panning = false
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    const canPan = () => el.scrollWidth > el.clientWidth + 1

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !canPan()) return
      panning = true
      startX = e.clientX
      startY = e.clientY
      startLeft = el.scrollLeft
      startTop = el.scrollTop
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!panning) return
      el.scrollLeft = startLeft - (e.clientX - startX)
      el.scrollTop = startTop - (e.clientY - startY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!panning) return
      panning = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* 캡처 해제 실패 무해 */
      }
      el.style.cursor = ''
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

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
      {rows.map((row) => (
        <div
          key={`row-${activeDoc.id}-${row[0]}`}
          className="flex w-full flex-row items-start justify-center gap-4"
        >
          {row.map((i) => {
            const p = pages[i]
            return (
              <PageSlot
                key={`${activeDoc.id}-${p.index}`}
                page={p}
                box={boxes[i]}
                doc={doc}
                pageIndex={p.index}
                visible={visible.has(p.index)}
                bytes={activeDoc.bytes}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
