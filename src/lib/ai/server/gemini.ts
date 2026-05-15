/**
 * Google Gemini 서버사이드 어댑터 (프록시 라우트 전용)
 *
 * v1beta streamGenerateContent SSE를 fetch로 직접 호출한다.
 * 비전: inline_data(base64) 파트 지원.
 *
 * 보안: 키는 반드시 x-goog-api-key 헤더로 전달. URL 쿼리 파라미터 금지
 * (프로젝트 규칙 — 브라우저 히스토리/로그/Referer 노출 방지).
 */

import type { AIContentPart } from '../messages'

// 현행 권장 모델 — 비전(inline_data) 입력 지원 확인됨
export const GEMINI_MODEL = 'gemini-2.5-flash'

const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }

function toGeminiParts(parts: AIContentPart[]): GeminiPart[] {
  return parts.map((p) =>
    p.type === 'text'
      ? { text: p.text }
      : { inline_data: { mime_type: p.mediaType, data: p.data } },
  )
}

/**
 * Gemini SSE 스트리밍 → 텍스트 델타 yield.
 *
 * @throws Error `${status}: ${body}` 형태
 */
export async function* streamGemini(
  apiKey: string,
  system: string,
  content: AIContentPart[],
): AsyncGenerator<string, void, unknown> {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: toGeminiParts(content) }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  }

  const res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // 키는 헤더로만 — 쿼리 파라미터 금지 (프로젝트 규칙)
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const text = await safeText(res)
    throw new Error(`${res.status}: ${text || res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line || !line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const json = JSON.parse(payload) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> }
            }>
          }
          const gparts = json.candidates?.[0]?.content?.parts
          if (gparts) {
            for (const part of gparts) {
              if (typeof part.text === 'string' && part.text.length > 0) {
                yield part.text
              }
            }
          }
        } catch {
          // 불완전 JSON은 무시 (다음 청크에서 누적)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
