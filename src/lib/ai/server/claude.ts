/**
 * Claude (Anthropic) 서버사이드 어댑터
 *
 * 프록시 라우트(app/api/ai/convert)에서만 호출된다. fetch로 Anthropic
 * Messages API의 SSE 스트림을 직접 호출하고, 텍스트 델타를 yield 한다.
 * (SDK 미사용 → dangerouslyAllowBrowser 불필요, 번들/CORS 무관)
 *
 * 비전: image content block(base64 source) 지원.
 * 프롬프트 캐싱: system 블록에 cache_control: ephemeral 적용.
 */

import type { AIContentPart } from '../messages'

export const CLAUDE_MODEL = 'claude-opus-4-7'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicTextBlock {
  type: 'text'
  text: string
}
interface AnthropicImageBlock {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}
type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock

function toAnthropicContent(parts: AIContentPart[]): AnthropicContentBlock[] {
  return parts.map((p) =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : {
          type: 'image',
          source: { type: 'base64', media_type: p.mediaType, data: p.data },
        },
  )
}

/**
 * Anthropic SSE 스트림을 호출하여 텍스트 델타를 yield.
 *
 * @throws Error `${status}: ${body}` 형태 (라우트에서 정규화)
 */
export async function* streamClaude(
  apiKey: string,
  system: string,
  content: AIContentPart[],
): AsyncGenerator<string, void, unknown> {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    stream: true,
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: toAnthropicContent(content) }],
  }

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
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
            type?: string
            delta?: { type?: string; text?: string }
          }
          if (
            json.type === 'content_block_delta' &&
            json.delta?.type === 'text_delta' &&
            typeof json.delta.text === 'string'
          ) {
            yield json.delta.text
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
