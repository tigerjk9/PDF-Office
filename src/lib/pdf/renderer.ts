/**
 * Canvas 렌더링 & 썸네일 생성 (pdfjs-dist)
 *
 * - renderPageToCanvas: 외부에서 제공된 canvas에 페이지를 렌더 (뷰어용)
 * - renderPageThumbnail: 저해상도 data URL 반환 (썸네일용)
 * - generateThumbnails: 문서 전체 썸네일 일괄 생성
 */

import './worker-config'
import { loadPdfDocument } from './loader'

export interface RenderOptions {
  /** 렌더 배율 (1.0 = 100%) */
  scale: number
  /** 누적 회전 각도 (0/90/180/270). pdfjs viewport에 합성 */
  rotation?: 0 | 90 | 180 | 270
}

/**
 * 특정 페이지를 외부 canvas에 직접 렌더.
 * 호출 측이 canvas DOM 노드를 소유한다.
 *
 * @param bytes PDF 원본 바이트
 * @param pageIndex 0-based 페이지 인덱스
 * @param canvas 렌더 대상 캔버스
 * @param opts 스케일/회전
 */
export async function renderPageToCanvas(
  bytes: Uint8Array,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): Promise<void> {
  const doc = await loadPdfDocument(bytes)
  try {
    const page = await doc.getPage(pageIndex + 1) // pdfjs는 1-based
    const viewport = page.getViewport({
      scale: opts.scale,
      rotation: opts.rotation ?? 0,
    })

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    // devicePixelRatio 대응 (HiDPI 선명도)
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise

    page.cleanup()
  } finally {
    await doc.destroy()
  }
}

/**
 * 페이지 썸네일을 data URL로 생성 (오프스크린 canvas).
 *
 * @param bytes PDF 원본 바이트
 * @param pageIndex 0-based 페이지 인덱스
 * @param scale 썸네일 배율 (기본 0.3)
 * @returns image/jpeg data URL
 */
export async function renderPageThumbnail(
  bytes: Uint8Array,
  pageIndex: number,
  scale = 0.3,
): Promise<string> {
  const doc = await loadPdfDocument(bytes)
  try {
    const page = await doc.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise

    page.cleanup()
    // JPEG q=0.7 — 페이지당 ~16KB 목표 (state-design.md 기준)
    return canvas.toDataURL('image/jpeg', 0.7)
  } finally {
    await doc.destroy()
  }
}

/**
 * 문서 내 모든 페이지의 썸네일을 순차 생성.
 * 메모리 보호를 위해 동시성 1 (직렬). 큐 기반 동시성은 thumbnail-queue.ts에서 처리.
 *
 * @param bytes PDF 바이트
 * @param scale 썸네일 배율
 * @param onProgress (index, total) 콜백 — 진행률 UI에 사용
 */
export async function generateThumbnails(
  bytes: Uint8Array,
  scale = 0.3,
  onProgress?: (index: number, total: number, dataUrl: string) => void,
): Promise<string[]> {
  const doc = await loadPdfDocument(bytes)
  const total = doc.numPages
  const results: string[] = []

  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')!

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      results.push(dataUrl)
      onProgress?.(i - 1, total, dataUrl)
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return results
}
