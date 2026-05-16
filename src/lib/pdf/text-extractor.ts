/**
 * PDF 텍스트 레이어 추출 (pdfjs-dist)
 *
 * AI 변환을 위해 페이지별 텍스트를 추출한다.
 * 페이지 내 모든 텍스트를 줄바꿈으로 연결한다.
 */

import './worker-config'
import { loadPdfDocument } from './loader'

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
