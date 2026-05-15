/**
 * 페이지 단위 AI 입력 추출 (P0-2: 스캔/이미지 PDF 비전 폴백)
 *
 * 각 페이지에서 텍스트 레이어를 추출하되, 텍스트가 비었거나 매우 적은
 * 페이지(스캔/이미지 PDF)는 해당 페이지를 PNG로 렌더해 base64 이미지를
 * 함께 반환한다. 비전 가능 모델(Claude/GPT-4o/Gemini)이 이미지를 읽어
 * Markdown을 생성하도록 한다.
 *
 * 소유권 주의: src/lib/pdf/renderer.ts는 엔진 소유라 수정 금지.
 * 본 모듈은 lib/ai 안에서 pdfjs를 자체 동적 import 하여 캔버스를 렌더한다
 * (extractor.ts와 동일한 동적 import 패턴).
 *
 * 클라이언트 전용: pdfjs 워커 + canvas는 브라우저에서만 동작한다.
 */

import type { PDFPageProxy } from 'pdfjs-dist'

/** 페이지 텍스트가 "비전 폴백 대상"인지 판단하는 최소 문자 수 임계값 */
export const MIN_TEXT_CHARS_PER_PAGE = 24

/** 비전 렌더 배율 — 가독성과 토큰/용량 사이 절충 (스캔 문서 OCR용) */
const VISION_RENDER_SCALE = 2.0

export interface ExtractedPage {
  /** 0-based 페이지 인덱스 */
  index: number
  /** 추출된 텍스트 (없으면 빈 문자열) */
  text: string
  /**
   * 텍스트가 부족해 비전 폴백이 필요한 경우의 PNG base64 (data URL).
   * 텍스트가 충분하면 undefined (비용 절약 — 이미지 미전송).
   */
  imageBase64?: string
}

interface ExtractOptions {
  /** 페이지 진행 콜백 (선택) */
  onProgress?: (done: number, total: number) => void
  /** 외부 취소 신호 */
  signal?: { aborted: boolean }
  /**
   * 변환 대상 페이지 인덱스 화이트리스트 (P2-2, 0-based).
   * 미지정/빈 배열이면 전체 페이지 추출(기본). 지정 시 해당 페이지만
   * 추출·렌더해 토큰/비용을 절감한다. 비전 폴백도 선택 페이지에만 적용.
   */
  pageIndices?: number[]
}

/**
 * PDF 바이트에서 페이지별 { text, imageBase64? } 배열을 만든다.
 *
 * 동작:
 *   1) 각 페이지 getTextContent()로 텍스트 추출.
 *   2) 텍스트가 MIN_TEXT_CHARS_PER_PAGE 미만이면 페이지를 PNG로 렌더해
 *      imageBase64에 담는다 (스캔/이미지 페이지).
 *   3) 텍스트가 충분하면 imageBase64는 생략 (텍스트 경로 유지 = 저비용).
 *
 * @param bytes PDF 바이너리
 */
export async function extractPagesForAI(
  bytes: Uint8Array,
  opts: ExtractOptions = {},
): Promise<ExtractedPage[]> {
  const pdfjs = await import('pdfjs-dist')

  if (
    typeof window !== 'undefined' &&
    !pdfjs.GlobalWorkerOptions.workerSrc
  ) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }

  // pdfjs가 입력 버퍼를 detach할 수 있으므로 방어적 복사.
  const data = bytes.slice()
  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await loadingTask.promise

  const pages: ExtractedPage[] = []
  try {
    const docPages = pdf.numPages

    // P2-2: 변환 대상 페이지 화이트리스트 결정.
    // pageIndices(0-based)를 1-based 페이지 번호 집합으로 변환.
    // 범위를 벗어나거나 중복된 값은 무시. 빈 결과면 전체 추출 폴백.
    let targets: number[]
    const requested = opts.pageIndices
    if (requested && requested.length > 0) {
      const set = new Set<number>()
      for (const idx of requested) {
        const pageNo = idx + 1
        if (Number.isInteger(pageNo) && pageNo >= 1 && pageNo <= docPages) {
          set.add(pageNo)
        }
      }
      targets =
        set.size > 0
          ? Array.from(set).sort((a, b) => a - b)
          : Array.from({ length: docPages }, (_, k) => k + 1)
    } else {
      targets = Array.from({ length: docPages }, (_, k) => k + 1)
    }

    const total = targets.length
    let done = 0
    for (const i of targets) {
      if (opts.signal?.aborted) {
        throw new Error('cancelled')
      }
      const page = await pdf.getPage(i)
      try {
        const content = await page.getTextContent()
        const text = content.items
          .map((it) => {
            if (typeof (it as { str?: unknown }).str === 'string') {
              return (it as { str: string }).str
            }
            return ''
          })
          .join(' ')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

        const needsVision = text.length < MIN_TEXT_CHARS_PER_PAGE
        let imageBase64: string | undefined

        if (needsVision) {
          imageBase64 = await renderPageToPng(page)
        }

        pages.push({ index: i - 1, text, imageBase64 })
      } finally {
        page.cleanup()
      }
      done++
      opts.onProgress?.(done, total)
    }
    return pages
  } finally {
    await pdf.cleanup().catch(() => {})
    await pdf.destroy().catch(() => {})
  }
}

/**
 * pdfjs PDFPageProxy를 오프스크린 canvas에 렌더해 PNG data URL을 반환.
 * (renderer.ts를 건드리지 않도록 lib/ai 자체 구현)
 */
async function renderPageToPng(
  page: PDFPageProxy,
): Promise<string | undefined> {
  if (typeof document === 'undefined') {
    // SSR/비브라우저 컨텍스트에서는 렌더 불가 → 텍스트 경로만.
    return undefined
  }
  const viewport = page.getViewport({ scale: VISION_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  await page.render({ canvasContext: ctx, viewport }).promise
  // PNG (스캔 문서 텍스트 보존). data URL 그대로 반환 (messages.ts가 분리).
  return canvas.toDataURL('image/png')
}
