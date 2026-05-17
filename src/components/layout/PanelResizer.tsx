'use client'

import { useRef } from 'react'

/**
 * 패널 우측 경계 드래그 리사이저(수직 분리자).
 *
 *  - pointerdown: 시작 X·너비 캡처 + setPointerCapture, body user-select 차단.
 *  - pointermove: onWidthChange(startW + dx). 클램프는 호출측(setWidth) 책임.
 *  - pointerup/cancel: 캡처 해제·드래그 종료, user-select 복원.
 */
export function PanelResizer(props: {
  width: number
  min: number
  max: number
  onWidthChange: (w: number) => void
}) {
  const { width, min, max, onWidthChange } = props
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    onWidthChange(d.startW + (e.clientX - d.startX))
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 캡처 해제 실패 무해 */
    }
    document.body.style.userSelect = ''
  }

  return (
    <div
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 active:bg-primary/40"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="separator"
      aria-orientation="vertical"
      aria-label="페이지 패널 크기 조절"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
    />
  )
}
