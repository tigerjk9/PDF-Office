/**
 * OpenAI API 어댑터 (BYO Key, 브라우저 fetch 직접 호출)
 *
 * SDK 의존성 없이 /v1/chat/completions 의 stream=true SSE를 사용한다.
 * - 모델: gpt-4o
 * - Authorization: Bearer 헤더로 키 전달 (쿼리 파라미터 사용 금지)
 */

import { SYSTEM_PROMPT } from '../prompt'

export const OPENAI_MODEL = 'gpt-4o'

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/**
 * OpenAI chat completion 스트리밍을 텍스트 델타로 yield 한다.
 */
export async function* streamWithOpenAI(
  apiKey: string,
  textContent: string,
): AsyncGenerator<string, void, unknown> {
  if (!apiKey) {
    throw new Error('401: OpenAI API key is required')
  }

  const body = {
    model: OPENAI_MODEL,
    stream: true,
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: textContent },
    ],
  }

  const res = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // API 키는 헤더로만 전송 (쿼리/본문 금지)
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await safeReadText(res)
    throw new Error(`${res.status}: ${text || res.statusText}`)
  }
  if (!res.body) {
    throw new Error('NETWORK_ERROR: OpenAI response body is empty')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') return

        try {
          const json = JSON.parse(payload) as OpenAIStreamChunk
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

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string }
    finish_reason?: string | null
  }>
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
