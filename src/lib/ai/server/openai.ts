/**
 * OpenAI 서버사이드 어댑터 (프록시 라우트 전용)
 *
 * /v1/chat/completions stream=true SSE를 fetch로 직접 호출한다.
 * 비전: image_url(data URL) 파트 지원 (gpt-4o).
 * 키는 Authorization: Bearer 헤더로만 전달.
 */

import type { AIContentPart } from '../messages'

export const OPENAI_MODEL = 'gpt-4o'

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

type OpenAIPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

function toOpenAIContent(parts: AIContentPart[]): OpenAIPart[] {
  return parts.map((p) =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : {
          type: 'image_url',
          image_url: { url: `data:${p.mediaType};base64,${p.data}` },
        },
  )
}

/**
 * OpenAI chat completion 스트리밍 → 텍스트 델타 yield.
 *
 * @throws Error `${status}: ${body}` 형태
 */
export async function* streamOpenAI(
  apiKey: string,
  system: string,
  content: AIContentPart[],
): AsyncGenerator<string, void, unknown> {
  const body = {
    model: OPENAI_MODEL,
    stream: true,
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: toOpenAIContent(content) },
    ],
  }

  const res = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
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
        if (!payload) continue
        if (payload === '[DONE]') return

        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = json.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta
          }
        } catch {
          // 부분 JSON 무시
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
