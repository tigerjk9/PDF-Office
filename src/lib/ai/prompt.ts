/**
 * AI 시스템 프롬프트 + 텍스트/페이지 청크 분할 유틸리티
 *
 * 모든 제공자(Claude/Gemini/OpenAI)가 동일한 시스템 프롬프트와 동일한
 * 청크 분할 정책을 공유하도록 단일 진실 소스 역할을 한다.
 *
 * - splitIntoChunks: 텍스트 전용(레거시 텍스트 경로) 청크 분할
 * - buildPageChunks: 페이지별 {text, imageBase64?} → 멀티모달 content 파트
 *   청크 (P0-2 비전 폴백). 텍스트 페이지는 텍스트 파트, 스캔 페이지는
 *   이미지 파트로 묶는다.
 */

import type { AIContentPart } from './messages'
import { imagePart, textPart } from './messages'
import type { ExtractedPage } from './page-extractor'

/**
 * PDF → Markdown 변환에 사용되는 시스템 프롬프트.
 *
 * 디자인 원칙:
 * - 구조적 Markdown (제목 계층, 표, 목록, 코드)
 * - 페이지 번호/헤더/풋터/워터마크 제거
 * - 이미지는 [Image: 설명] 플레이스홀더
 * - 출력에는 변환 결과 외 메타 코멘트 금지
 */
export const SYSTEM_PROMPT = `You are an expert at converting PDF documents to well-structured Markdown.

Rules:
- Use #, ##, ### for headings based on visual hierarchy
- Convert tables to Markdown table syntax with header row and separator
- Preserve numbered and bullet lists with correct indentation
- Wrap code samples in triple backticks with a language hint when possible
- Replace images with [Image: short description] placeholder
- Remove page numbers, repeated headers, footers, and watermarks
- Preserve all meaningful textual content; never summarize or omit
- Join hyphenated line breaks (e.g. "exam-\\nple" -> "example")
- Output ONLY the Markdown content. No preamble, no commentary, no explanation.`

/**
 * 단일 청크의 최대 문자 수.
 * Claude의 200K 토큰 한도 기준 안전 마진을 둔 값(약 15K tokens).
 * `context_length_exceeded` 발생 시 호출 측이 절반으로 줄여 재시도한다.
 */
export const MAX_CHARS_PER_CHUNK = 60_000

/**
 * 페이지 구분자.
 * extractor.ts가 페이지마다 이 구분자를 삽입하므로,
 * splitIntoChunks는 가능한 한 페이지 경계에서 분할한다.
 */
export const PAGE_SEPARATOR = '\n\n---\n\n'

/**
 * 긴 PDF 텍스트를 토큰 한도 초과를 피하기 위해 청크로 분할한다.
 *
 * 분할 전략:
 *   1) 텍스트가 MAX_CHARS_PER_CHUNK 이하면 그대로 단일 청크 반환.
 *   2) PAGE_SEPARATOR로 분할된 페이지 단위를 누적하면서
 *      한도를 넘기 직전에 청크를 끊는다.
 *   3) 단일 페이지가 한도를 초과하면 문단(`\n\n`) → 줄(`\n`)
 *      → 마지막엔 강제 슬라이스로 fallback 한다.
 *
 * @param text PDF 전체 텍스트 (extractor.ts가 만든 페이지 결합 문자열)
 * @param maxChars 청크 최대 문자 수 (재시도 시 절반으로 줄여 호출 가능)
 */
export function splitIntoChunks(
  text: string,
  maxChars: number = MAX_CHARS_PER_CHUNK,
): string[] {
  if (!text) return []
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  const pages = text.split(PAGE_SEPARATOR)
  let current = ''

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ''
  }

  for (const rawPage of pages) {
    const page = rawPage
    // 단일 페이지 자체가 한도를 넘는 경우: 문단/줄 단위로 추가 분할.
    if (page.length > maxChars) {
      flush()
      for (const sub of splitOversizedSegment(page, maxChars)) {
        chunks.push(sub)
      }
      continue
    }

    // 현재 누적 + 다음 페이지가 한도를 넘으면 flush 후 새 청크 시작.
    const candidate = current ? current + PAGE_SEPARATOR + page : page
    if (candidate.length > maxChars) {
      flush()
      current = page
    } else {
      current = candidate
    }
  }

  flush()
  return chunks
}

/**
 * 한 페이지가 maxChars를 초과하는 비정상 케이스용 fallback.
 * 문단 → 줄 → 강제 슬라이스 순으로 잘게 쪼갠다.
 */
function splitOversizedSegment(segment: string, maxChars: number): string[] {
  const out: string[] = []

  const paragraphs = segment.split(/\n{2,}/)
  let buf = ''
  const pushBuf = () => {
    const t = buf.trim()
    if (t) out.push(t)
    buf = ''
  }

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      pushBuf()
      // 줄 단위 시도
      const lines = para.split('\n')
      let lineBuf = ''
      for (const line of lines) {
        if (line.length > maxChars) {
          // 강제 슬라이스
          if (lineBuf.trim()) {
            out.push(lineBuf.trim())
            lineBuf = ''
          }
          for (let i = 0; i < line.length; i += maxChars) {
            out.push(line.slice(i, i + maxChars))
          }
          continue
        }
        const cand = lineBuf ? lineBuf + '\n' + line : line
        if (cand.length > maxChars) {
          if (lineBuf.trim()) out.push(lineBuf.trim())
          lineBuf = line
        } else {
          lineBuf = cand
        }
      }
      if (lineBuf.trim()) out.push(lineBuf.trim())
      continue
    }

    const cand = buf ? buf + '\n\n' + para : para
    if (cand.length > maxChars) {
      pushBuf()
      buf = para
    } else {
      buf = cand
    }
  }
  pushBuf()
  return out
}

/**
 * 사용자 메시지(첫 청크 / 중간 청크) 빌더.
 * 다중 청크 변환 시 후속 청크에 직전 문맥을 명시해 마크다운 연속성을 유지한다.
 */
export function buildUserMessage(
  chunk: string,
  index: number,
  total: number,
): string {
  if (total <= 1) {
    return `Convert the following PDF text to Markdown.\n\n${chunk}`
  }
  if (index === 0) {
    return (
      `Convert the following PDF text to Markdown.\n` +
      `This is part 1 of ${total}. Subsequent parts will continue from where you stop. ` +
      `Do not add any final closing remarks — just emit Markdown.\n\n${chunk}`
    )
  }
  return (
    `Continue converting the same PDF document. This is part ${index + 1} of ${total}. ` +
    `Keep the same Markdown style. Do not repeat the previous content. ` +
    `Do not add headers like "Part ${index + 1}". Just continue.\n\n${chunk}`
  )
}

// ---------------------------------------------------------------------------
// 페이지 기반 멀티모달 청크 (P0-2 비전 폴백)
// ---------------------------------------------------------------------------

/** 한 청크에 담을 수 있는 비전 이미지 최대 개수 (요청 크기/토큰 가드) */
export const MAX_IMAGES_PER_CHUNK = 5

/** 한 청크에 담을 수 있는 텍스트 최대 문자 수 (이미지 동반 시) */
const MAX_TEXT_PER_PAGE_CHUNK = MAX_CHARS_PER_CHUNK

/**
 * 단일 변환 청크. content는 멀티모달 파트 배열.
 * - 텍스트 페이지: text 파트
 * - 스캔/이미지 페이지: 안내 텍스트 + image 파트
 */
export interface PageChunk {
  content: AIContentPart[]
  /** 이 청크에 비전 이미지가 포함되는지 (디버그/판단용) */
  hasImages: boolean
}

/**
 * 추출된 페이지 배열을 모델 호출용 청크로 묶는다.
 *
 * 정책:
 *   - 텍스트가 있는 페이지: 텍스트 누적. PAGE_SEPARATOR로 페이지 경계 표시.
 *   - 텍스트가 부족하고 imageBase64가 있는 페이지: 이미지 파트로 추가.
 *   - 청크 경계: 텍스트가 maxChars를 넘거나, 이미지 수가
 *     MAX_IMAGES_PER_CHUNK를 넘으면 새 청크 시작.
 *   - 전 페이지가 텍스트 0이고 이미지도 없으면 빈 배열 반환(호출 측이
 *     "비텍스트 + 비전 불가" 한국어 에러 처리).
 *
 * @param pages extractPagesForAI 결과
 * @param maxChars 청크당 최대 텍스트 문자 수 (재시도 시 축소 가능)
 */
export function buildPageChunks(
  pages: ExtractedPage[],
  maxChars: number = MAX_TEXT_PER_PAGE_CHUNK,
): PageChunk[] {
  const chunks: PageChunk[] = []

  let textBuf = ''
  let parts: AIContentPart[] = []
  let imageCount = 0
  let hasAnyText = false

  const flush = () => {
    const finalized: AIContentPart[] = []
    const trimmed = textBuf.trim()
    if (trimmed) finalized.push(textPart(trimmed))
    // 누적된 이미지 파트(+안내 텍스트) 이어붙임
    for (const p of parts) finalized.push(p)
    if (finalized.length > 0) {
      chunks.push({
        content: finalized,
        hasImages: finalized.some((p) => p.type === 'image'),
      })
    }
    textBuf = ''
    parts = []
    imageCount = 0
  }

  for (const page of pages) {
    const pageText = page.text?.trim() ?? ''
    const useVision =
      pageText.length < 1 && typeof page.imageBase64 === 'string'

    if (useVision && page.imageBase64) {
      // 이미지 청크 한도 초과 시 분리
      if (imageCount >= MAX_IMAGES_PER_CHUNK) flush()
      parts.push(
        textPart(
          `[Page ${page.index + 1}] This page has no text layer (scanned/image). ` +
            `Transcribe its content to Markdown from the image:`,
        ),
      )
      parts.push(imagePart(page.imageBase64))
      imageCount++
      continue
    }

    if (pageText) {
      hasAnyText = true
      const candidate = textBuf
        ? textBuf + PAGE_SEPARATOR + pageText
        : pageText
      if (candidate.length > maxChars && textBuf) {
        flush()
        textBuf = pageText
      } else if (candidate.length > maxChars) {
        // 단일 페이지가 한도 초과: 강제 텍스트 분할 후 개별 청크.
        for (const sub of splitIntoChunks(pageText, maxChars)) {
          chunks.push({ content: [textPart(sub)], hasImages: false })
        }
        textBuf = ''
      } else {
        textBuf = candidate
      }
    }
    // pageText 비었고 imageBase64도 없으면 스킵 (정보 없음)
  }

  flush()

  // 텍스트도 이미지도 전혀 없으면 빈 청크 → 호출 측이 에러 처리
  if (chunks.length === 0 && !hasAnyText) return []
  return chunks
}
