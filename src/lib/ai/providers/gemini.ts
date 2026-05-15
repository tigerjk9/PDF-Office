/**
 * Gemini 클라이언트 어댑터 (동일 출처 프록시 경유)
 *
 * 이전: 브라우저에서 generativelanguage.googleapis.com 직접 fetch.
 * 현재: `/api/ai/convert` 프록시로 위임. 실제 Gemini 호출은 서버
 * (src/lib/ai/server/gemini.ts)에서 수행하며, 키는 x-goog-api-key
 * 헤더로만 전달한다(쿼리 파라미터 금지 — 프로젝트 규칙).
 */

import type { AIContentPart } from '../messages'
import { textPart } from '../messages'
import { GEMINI_MODEL } from '../server/gemini'
import { streamViaProxy } from '../transport'
import { SYSTEM_PROMPT } from '../prompt'

export { GEMINI_MODEL }

/**
 * Gemini 변환 스트리밍 (프록시 경유). 텍스트 또는 멀티모달 파트 입력.
 */
export async function* streamWithGemini(
  apiKey: string,
  input: string | AIContentPart[],
  signal?: { aborted: boolean },
): AsyncGenerator<string, void, unknown> {
  const content: AIContentPart[] =
    typeof input === 'string' ? [textPart(input)] : input
  yield* streamViaProxy({
    provider: 'gemini',
    apiKey,
    system: SYSTEM_PROMPT,
    content,
    signal,
  })
}
