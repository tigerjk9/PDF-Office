/**
 * Claude 클라이언트 어댑터 (동일 출처 프록시 경유)
 *
 * 이전: 브라우저에서 Anthropic SDK 직접 호출 (dangerouslyAllowBrowser,
 * CORS·키 노출 위험). 현재: `/api/ai/convert` 프록시로 위임.
 * 실제 Anthropic 호출은 서버(src/lib/ai/server/claude.ts)에서 수행한다.
 *
 * 시그니처 호환: 기존 호출부(converter.ts)의 streamWithClaude(apiKey, text)
 * 를 그대로 유지하면서, 멀티모달 content 파트도 받을 수 있도록 확장한다.
 */

import type { AIContentPart } from '../messages'
import { textPart } from '../messages'
import { CLAUDE_MODEL } from '../server/claude'
import { streamViaProxy } from '../transport'
import { SYSTEM_PROMPT } from '../prompt'

export { CLAUDE_MODEL }

/**
 * Claude 변환 스트리밍 (프록시 경유). 텍스트 문자열 또는 멀티모달
 * content 파트 배열을 입력으로 받는다.
 *
 * @param apiKey 사용자 BYO 키 (서버 미저장)
 * @param input 텍스트 또는 AIContentPart[] (비전 페이지 포함 가능)
 * @param signal 취소 신호
 */
export async function* streamWithClaude(
  apiKey: string,
  input: string | AIContentPart[],
  signal?: { aborted: boolean },
): AsyncGenerator<string, void, unknown> {
  const content: AIContentPart[] =
    typeof input === 'string' ? [textPart(input)] : input
  yield* streamViaProxy({
    provider: 'claude',
    apiKey,
    system: SYSTEM_PROMPT,
    content,
    signal,
  })
}
