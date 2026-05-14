/**
 * Google Gemini API 어댑터 (BYO Key, 브라우저 fetch 직접 호출)
 *
 * SDK 의존성 없이 v1beta streamGenerateContent SSE 엔드포인트를 사용한다.
 * - 모델: gemini-1.5-pro-latest
 * - 시스템 프롬프트는 system_instruction 필드로 전달
 * - 응답: SSE (Server-Sent Events), 한 라인이 `data: { ... }` JSON
 */

import { SYSTEM_PROMPT } from '../prompt'

export const GEMINI_MODEL = 'gemini-1.5-pro-latest'

const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`

/**
 * Gemini API에 텍스트를 보내고 스트리밍 응답을 텍스트 델타로 yield 한다.
 *
 * 보안:
 *   - API 키는 `x-goog-api-key` 헤더로 전송한다. URL 쿼리 파라미터로 전송하지 않으므로
 *     브라우저 히스토리/로그/Referer에 키가 노출될 위험을 제거한다.
 *   - localStorage에서만 보관되고 외부 로깅으로 노출되지 않도록 호출 측에서 보장한다.
 */
export async function* streamWithGemini(
  apiKey: string,
  textContent: string,
): AsyncGenerator<string, void, unknown> {
  if (!apiKey) {
    throw new Error('401: Gemini API key is required')
  }

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: textContent }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  }

  const res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await safeReadText(res)
    throw new Error(`${res.status}: ${text || res.statusText}`)
  }
  if (!res.body) {
    throw new Error('NETWORK_ERROR: Gemini response body is empty')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE는 빈 줄로 이벤트가 구분된다. 라인 단위로 파싱.
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const json = JSON.parse(payload) as GeminiStreamChunk
          const parts = json.candidates?.[0]?.content?.parts
          if (parts) {
            for (const part of parts) {
              if (typeof part.text === 'string' && part.text.length > 0) {
                yield part.text
              }
            }
          }
        } catch {
          // 불완전 JSON은 무시 (다음 청크에서 누적된다)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
