'use client'

import { useEffect, useRef } from 'react'

/**
 * 연속 뷰어 스크롤 ↔ currentPageIndex 양방향 동기화.
 *
 *  - 사용자 스크롤 → rAF 스로틀로 뷰포트 중앙에 가장 가까운 슬롯 계산
 *    → onPageChange(idx). (프로그램 스크롤 중에는 억제)
 *  - 외부에서 currentPageIndex 변경(썸네일/번호/키보드) → 해당 슬롯로
 *    scrollIntoView. 이때 suppress 플래그를 세워 스크롤→상태 루프 차단.
 *
 * 슬롯은 `[data-page-index]` 속성으로 식별한다(PageSlot 가 부여).
 */
export function useViewerScrollSync(args: {
  containerRef: React.RefObject<HTMLDivElement | null>
  currentPageIndex: number
  pageCount: number
  onPageChange: (index: number) => void
}) {
  const { containerRef, currentPageIndex, pageCount, onPageChange } = args
  const suppressRef = useRef(false)
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const rafRef = useRef(0)
  const lastReportedRef = useRef(currentPageIndex)

  // 사용자 스크롤 → 중앙 슬롯 계산
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      if (suppressRef.current) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const centerY = rect.top + rect.height / 2
        const slots = el.querySelectorAll<HTMLElement>('[data-page-index]')
        let bestIdx = lastReportedRef.current
        let bestDist = Infinity
        slots.forEach((s) => {
          const r = s.getBoundingClientRect()
          const c = r.top + r.height / 2
          const d = Math.abs(c - centerY)
          if (d < bestDist) {
            bestDist = d
            bestIdx = Number(s.dataset.pageIndex)
          }
        })
        if (
          Number.isFinite(bestIdx) &&
          bestIdx !== lastReportedRef.current
        ) {
          lastReportedRef.current = bestIdx
          onPageChange(bestIdx)
        }
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, onPageChange])

  // 외부 currentPageIndex 변경 → 해당 슬롯로 스크롤(억제 플래그)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (currentPageIndex === lastReportedRef.current) return // 스크롤 자기발화
    if (pageCount <= 0) return

    const target = el.querySelector<HTMLElement>(
      `[data-page-index="${currentPageIndex}"]`,
    )
    if (!target) return

    suppressRef.current = true
    lastReportedRef.current = currentPageIndex
    target.scrollIntoView({ block: 'start', behavior: 'auto' })

    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
    suppressTimerRef.current = setTimeout(() => {
      suppressRef.current = false
    }, 180)

    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
    }
  }, [containerRef, currentPageIndex, pageCount])
}
