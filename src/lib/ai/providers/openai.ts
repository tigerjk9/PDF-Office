/**
 * OpenAI 클라이언트 어댑터 (동일 출처 프록시 경유)
 *
 * 이전: 브라우저에서 api.openai.com 직접 fetch (CORS·키 노출 위험).
 * 현재: `/api/ai/convert` 프록시로 위임. 실제 OpenAI 호출은 서버
 * (src/lib/ai/server/openai.ts)에서 수행한다.
 */

import type { AIContentPart } from '../messages'
import { textPart } from '../messages'
import { OPENAI_MODEL } from '../server/openai'
import { streamViaProxy } from '../transport'
import { SYSTEM_PROMPT } from '../prompt'

export { OPENAI_MODEL }

/**
 * OpenAI 변환 스트리밍 (프록시 경유). 텍스트 또는 멀티모달 파트 입력.
 */
export async function* streamWithOpenAI(
  apiKey: string,
  input: string | AIContentPart[],
  signal?: { aborted: boolean },
): AsyncGenerator<string, void, unknown> {
  const content: AIContentPart[] =
    typeof input === 'string' ? [textPart(input)] : input
  yield* streamViaProxy({
    provider: 'openai',
    apiKey,
    system: SYSTEM_PROMPT,
    content,
    signal,
  })
}
