/**
 * PDF 텍스트 검색 (pdfjs-dist) — P2-8
 *
 * 페이지별 textContent를 추출해 대소문자 무시 검색을 수행하고,
 * 매치된 페이지마다 매치 주변의 짧은 스니펫을 반환한다.
 *
 * ⚠️ 동결 계약: 아래 `searchText` 시그니처는 UI가 직접 import해 소비한다.
 *    `(bytes: Uint8Array, query: string) => Promise<{ pageIndex: number; snippet: string }[]>`
 *    절대 변경하지 말 것.
 */

import './worker-config'
import { loadPdfDocument } from './loader'

/** 매치 스니펫에서 매치 양옆으로 보여줄 문자 수 */
const SNIPPET_CONTEXT = 40

/**
 * 문서 전체에서 query를 검색한다(대소문자 무시).
 *
 * - 페이지의 textContent 항목을 공백으로 연결해 한 줄 텍스트로 만든 뒤
 *   첫 매치 위치 주변을 잘라 스니펫으로 반환한다.
 * - 매치가 없는 페이지는 결과에 포함하지 않는다.
 * - query가 비어 있으면 빈 배열을 반환한다.
 *
 * @param bytes PDF 원본 바이트
 * @param query 검색어
 * @returns 매치된 페이지별 { pageIndex(0-based), snippet }
 */
export async function searchText(
  bytes: Uint8Array,
  query: string,
): Promise<{ pageIndex: number; snippet: string }[]> {
  const needle = query.trim()
  if (!needle) return []

  const doc = await loadPdfDocument(bytes)
  const results: { pageIndex: number; snippet: string }[] = []
  const lowerNeedle = needle.toLowerCase()

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()

      const parts: string[] = []
      for (const item of textContent.items as Array<{ str?: string }>) {
        if (typeof item.str === 'string' && item.str.length > 0) {
          parts.push(item.str)
        }
      }
      page.cleanup()

      // 항목 사이에 공백을 넣어 연결(원본 토큰 경계 보존).
      const pageText = parts.join(' ').replace(/\s+/g, ' ').trim()
      const matchPos = pageText.toLowerCase().indexOf(lowerNeedle)

      if (matchPos >= 0) {
        results.push({
          pageIndex: i - 1,
          snippet: buildSnippet(pageText, matchPos, needle.length),
        })
      }
    }
  } finally {
    await doc.destroy()
  }

  return results
}

/**
 * 매치 위치를 중심으로 앞뒤 컨텍스트를 포함한 짧은 스니펫을 만든다.
 * 잘린 양끝에는 줄임표(…)를 붙인다.
 */
function buildSnippet(
  text: string,
  matchPos: number,
  matchLen: number,
): string {
  const start = Math.max(0, matchPos - SNIPPET_CONTEXT)
  const end = Math.min(text.length, matchPos + matchLen + SNIPPET_CONTEXT)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}
