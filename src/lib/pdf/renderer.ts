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

/** 취소 가능한 렌더 핸들. */
export interface RenderHandle {
  /** 렌더 완료(또는 취소 시 조용히 resolve). 에러만 reject. */
  promise: Promise<void>
  /** 진행 중 pdfjs RenderTask 를 취소한다(같은 캔버스 다중 render 충돌 방지). */
  cancel: () => void
}

/** pdfjs 가 취소 시 던지는 예외인지 식별. */
function isCancelled(e: unknown): boolean {
  return !!e && (e as { name?: string }).name === 'RenderingCancelledException'
}

/**
 * 특정 페이지를 외부 canvas에 직접 렌더 (취소 가능).
 *
 * 같은 canvas 에 대한 동시 render() 는 pdfjs 에서 금지("Cannot use the same
 * canvas during multiple render() operations")되므로, 호출 측은 새 렌더 전에
 * 반드시 이전 핸들의 cancel() 을 호출해야 한다.
 *
 * @param bytes PDF 원본 바이트
 * @param pageIndex 0-based 페이지 인덱스
 * @param canvas 렌더 대상 캔버스
 * @param opts 스케일/회전
 */
export function renderPageToCanvas(
  bytes: Uint8Array,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): RenderHandle {
  let cancelled = false
  let renderTask: { cancel: () => void } | null = null

  const promise = (async () => {
    const doc = await loadPdfDocument(bytes)
    try {
      if (cancelled) return
      const page = await doc.getPage(pageIndex + 1) // pdfjs는 1-based
      const viewport = page.getViewport({
        scale: opts.scale,
        rotation: opts.rotation ?? 0,
      })

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      // devicePixelRatio 대응 (HiDPI 선명도)
      const dpr =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (cancelled) return
      const task = page.render({ canvasContext: ctx, viewport })
      renderTask = task
      try {
        await task.promise
      } catch (e) {
        if (!isCancelled(e)) throw e
        return // 취소는 정상 흐름 — 조용히 종료
      }
      page.cleanup()
    } finally {
      await doc.destroy()
    }
  })()

  return {
    promise,
    cancel: () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {
        // 이미 종료된 태스크 취소는 무해
      }
    },
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
