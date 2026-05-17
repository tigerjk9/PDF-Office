'use client'

import { useEffect, useState } from 'react'

/**
 * 패널 너비 상태 + localStorage 영속 + 클램프.
 *
 *  - 초기 렌더는 SSR 안전하게 def 사용(서버/클라 동일).
 *  - 마운트 후 effect에서 localStorage 값 읽어 클램프 반영(있을 때만).
 *  - setWidth는 [min,max] 클램프 후 state + localStorage 동기화.
 *  - 손상값(비유한)은 무시하고 기존값 유지(폴백).
 */
export function usePanelWidth(
  key: string,
  def: number,
  min: number,
  max: number,
): { width: number; setWidth: (w: number) => void } {
  const [width, setWidthState] = useState(def)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) return
      setWidthState(Math.max(min, Math.min(max, parsed)))
    } catch {
      /* localStorage 접근 불가(프라이빗 모드 등) → def 유지 */
    }
  }, [key, min, max])

  const setWidth = (w: number) => {
    if (!Number.isFinite(w)) return
    const clamped = Math.max(min, Math.min(max, w))
    setWidthState(clamped)
    try {
      localStorage.setItem(key, String(clamped))
    } catch {
      /* 저장 실패 무해(메모리 상태는 유지) */
    }
  }

  return { width, setWidth }
}
