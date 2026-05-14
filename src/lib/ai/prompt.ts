/**
 * AI 시스템 프롬프트 + 텍스트 청크 분할 유틸리티
 *
 * 모든 제공자(Claude/Gemini/OpenAI)가 동일한 시스템 프롬프트와 동일한
 * 청크 분할 정책을 공유하도록 단일 진실 소스 역할을 한다.
 */

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
