/**
 * 페이지 표시 박스(px)와 렌더 스케일 계산 — 단일/연속 뷰어 공용 순수 함수.
 *
 * 기존 PdfViewer.boxSize useMemo 로직을 무변경 추출한 것이다.
 *  - 회전 90/270 → 종횡비 스왑
 *  - fit-width: 가용 폭에 맞춤 / fit-page: 가용 폭·높이 중 작은 쪽 / null: zoom 그대로
 *  - 컨테이너 padding 보정(기본 48 = Tailwind p-6 24*2)
 */
import type { PdfPage, ViewerState } from '@/lib/types'

export interface PageBox {
  /** 박스 너비(px, 정수) */
  w: number
  /** 박스 높이(px, 정수) */
  h: number
  /** pdfjs viewport 스케일 */
  scale: number
}

/** 컨테이너 padding 보정 기본값 (Tailwind p-6 = 24px * 2) */
export const DEFAULT_CONTAINER_PAD = 48

export function computePageBox(
  page: Pick<PdfPage, 'width' | 'height' | 'rotation'>,
  opts: {
    zoom: number
    fitMode: ViewerState['fitMode']
    /** 컨테이너 가용 너비(px, padding 포함 전 값) */
    availW: number
    /** 컨테이너 가용 높이(px, padding 포함 전 값) */
    availH: number
    /** padding 보정값(기본 48). 슬롯 등 padding 다를 때 0 전달 */
    pad?: number
  },
): PageBox {
  const pad = opts.pad ?? DEFAULT_CONTAINER_PAD
  const availW = Math.max(opts.availW - pad, 100)
  const availH = Math.max(opts.availH - pad, 100)

  const rotated = page.rotation === 90 || page.rotation === 270
  const pw = rotated ? page.height : page.width
  const ph = rotated ? page.width : page.height

  let scale = opts.zoom
  if (opts.fitMode === 'fit-width') {
    scale = availW / pw
  } else if (opts.fitMode === 'fit-page') {
    scale = Math.min(availW / pw, availH / ph)
  }

  return {
    w: Math.max(Math.round(pw * scale), 1),
    h: Math.max(Math.round(ph * scale), 1),
    scale,
  }
}
