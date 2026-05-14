/**
 * Anthropic Claude API 어댑터 (BYO Key, 브라우저 직접 호출)
 *
 * - 모델: claude-opus-4-7
 * - 프롬프트 캐싱: system 블록에 cache_control: 'ephemeral' 적용
 * - dangerouslyAllowBrowser: true (사용자가 자신의 키로 호출하는 BYOK 모델)
 */

import Anthropic from '@anthropic-ai/sdk'

import { SYSTEM_PROMPT } from '../prompt'

/** Claude 모델 식별자. 변경 시 비용/품질 영향 확인 필요. */
export const CLAUDE_MODEL = 'claude-opus-4-7'

/**
 * Claude API를 스트리밍으로 호출하여 텍스트 델타를 yield 한다.
 *
 * @param apiKey 사용자 입력 API 키 (sk-ant-...)
 * @param textContent PDF에서 추출한 텍스트 또는 분할 청크
 * @yields content_block_delta 의 text_delta 문자열
 *
 * @throws Error API 키 오류(401), rate limit(429), context length 초과 등
 *   원본 에러는 converter.ts에서 PdfError로 정규화된다.
 */
export async function* streamWithClaude(
  apiKey: string,
  textContent: string,
): AsyncGenerator<string, void, unknown> {
  if (!apiKey) {
    throw new Error('401: Claude API key is required')
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    // @ts-expect-error cache_control is valid at runtime but not typed in sdk@0.32
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: textContent,
      },
    ],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}
