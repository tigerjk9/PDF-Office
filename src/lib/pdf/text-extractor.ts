/**
 * PDF 텍스트 레이어 추출 (pdfjs-dist)
 *
 * AI 변환 및 텍스트 편집을 위해 페이지별 텍스트를 추출한다.
 * - 단순 텍스트 (extractPageText): 페이지 내 모든 텍스트를 줄바꿈으로 연결
 * - 위치 정보 포함 (extractTextItems): 좌표/폰트 정보 보존
 */

import './worker-config'
import { loadPdfDocument } from './loader'

export interface TextItem {
  /** 텍스트 콘텐츠 */
  str: string
  /** PDF 좌표계 (왼쪽 아래 원점). [a, b, c, d, e, f] = [scaleX, skewY, skewX, scaleY, x, y] */
  transform: number[]
  /** 텍스트 폭 (pt) */
  width: number
  /** 텍스트 높이 (pt) */
  height: number
  /** 폰트 이름 (예: "g_d0_f1") */
  fontName: string
  /** 다음 항목 사이에 공백/줄바꿈 여부 */
  hasEOL: boolean
}

/**
 * 페이지의 평문 텍스트만 추출.
 *
 * @param bytes PDF 바이트
 * @param pageIndex 0-based
 * @returns 줄바꿈으로 결합된 텍스트
 */
export async function extractPageText(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await loadPdfDocument(bytes)
  try {
    const page = await doc.getPage(pageIndex + 1)
    const textContent = await page.getTextContent()
    const parts: string[] = []

    for (const item of textContent.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str === 'string') {
        parts.push(item.str)
        if (item.hasEOL) parts.push('\n')
      }
    }

    page.cleanup()
    // 연속된 공백/개행 정리
    return parts.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    await doc.destroy()
  }
}

/**
 * 페이지의 모든 텍스트 항목을 위치 정보와 함께 추출.
 * 텍스트 편집(targetText 검색)에 사용.
 */
export async function extractTextItems(bytes: Uint8Array, pageIndex: number): Promise<TextItem[]> {
  const doc = await loadPdfDocument(bytes)
  try {
    const page = await doc.getPage(pageIndex + 1)
    const textContent = await page.getTextContent()
    const items: TextItem[] = []

    for (const it of textContent.items as Array<{
      str?: string
      transform?: number[]
      width?: number
      height?: number
      fontName?: string
      hasEOL?: boolean
    }>) {
      if (typeof it.str !== 'string') continue
      items.push({
        str: it.str,
        transform: it.transform ?? [1, 0, 0, 1, 0, 0],
        width: it.width ?? 0,
        height: it.height ?? 0,
        fontName: it.fontName ?? '',
        hasEOL: !!it.hasEOL,
      })
    }

    page.cleanup()
    return items
  } finally {
    await doc.destroy()
  }
}

/**
 * 문서 전체 텍스트 추출 (페이지별 배열로 반환).
 * AI 변환 시 페이지 단위 컨텍스트 유지를 위해 사용.
 */
export async function extractAllPagesText(bytes: Uint8Array): Promise<string[]> {
  const doc = await loadPdfDocument(bytes)
  const out: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const parts: string[] = []
      for (const item of tc.items as Array<{ str?: string; hasEOL?: boolean }>) {
        if (typeof item.str === 'string') {
          parts.push(item.str)
          if (item.hasEOL) parts.push('\n')
        }
      }
      out.push(parts.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return out
}

/**
 * 특정 텍스트가 페이지 내에 존재하는지 빠르게 검사.
 * EditTextOperation의 사전 검증에 사용.
 */
export async function hasTextInPage(
  bytes: Uint8Array,
  pageIndex: number,
  target: string,
): Promise<boolean> {
  if (!target) return false
  const text = await extractPageText(bytes, pageIndex)
  return text.includes(target)
}
