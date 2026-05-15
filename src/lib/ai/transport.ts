/**
 * 클라이언트 → 동일 출처 프록시 전송 계층 (P0-3)
 *
 * 모든 공급자 호출은 이 모듈을 경유하여 `/api/ai/convert`로 동일 출처
 * POST 된다. 브라우저는 외부 AI API를 직접 호출하지 않는다
 * (CORS·키 노출·dangerouslyAllowBrowser 제거).
 *
 * 응답은 순수 텍스트 스트림(공급자 SSE를 서버가 파싱·평탄화). 본문 중
 * `__AI_PROXY_ERROR__:` sentinel이 나타나면 스트림 도중 발생한 공급자
 * 에러로 간주하고 Error를 throw 한다 (converter.ts의 normalizeError가
 * 한국어 메시지로 변환).
 */

import type { AIContentPart, AIConvertRequest } from './messages'

/** 스트림 에러 sentinel — 라우트(route.ts)와 문자열이 일치해야 한다. */
const ERROR_SENTINEL = '__AI_PROXY_ERROR__:'

export interface ProxyStreamArgs {
  provider: AIConvertRequest['provider']
  apiKey: string
  system: string
  content: AIContentPart[]
  /** 외부 취소 신호 (converter.ts의 signal과 연동) */
  signal?: { aborted: boolean }
}

/**
 * 프록시로 변환 요청을 보내고 텍스트 델타를 스트리밍으로 yield 한다.
 *
 * @throws Error 네트워크/HTTP/공급자 에러. message는 converter.ts에서
 *   normalizeError로 한국어 사용자 메시지로 정규화된다.
 */
export async function* streamViaProxy(
  args: ProxyStreamArgs,
): AsyncGenerator<string, void, unknown> {
  if (!args.apiKey) {
    throw new Error('401: API key is required')
  }

  // fetch 취소를 위한 AbortController — signal.aborted를 폴링해 abort.
  const ac = new AbortController()
  let abortPoll: ReturnType<typeof setInterval> | undefined
  if (args.signal) {
    abortPoll = setInterval(() => {
      if (args.signal?.aborted) ac.abort()
    }, 120)
  }

  let res: Response
  try {
    res = await fetch('/api/ai/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: args.provider,
        apiKey: args.apiKey,
        system: args.system,
        content: args.content,
      }),
      signal: ac.signal,
    })
  } catch (e) {
    if (abortPoll) clearInterval(abortPoll)
    if (args.signal?.aborted || (e as Error)?.name === 'AbortError') {
      throw new Error('cancelled')
    }
    throw new Error(`Failed to fetch: ${(e as Error).message ?? e}`)
  }

  // 검증 단계 에러는 JSON {error} 로 내려온다.
  if (!res.ok) {
    if (abortPoll) clearInterval(abortPoll)
    let msg = res.statusText
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      /* JSON 아님 — statusText 사용 */
    }
    throw new Error(`${res.status}: ${msg}`)
  }
  if (!res.body) {
    if (abortPoll) clearInterval(abortPoll)
    throw new Error('NETWORK_ERROR: empty response body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  // sentinel이 청크 경계에 걸쳐 잘릴 수 있으므로 tail을 보류한다.
  let pending = ''

  try {
    for (;;) {
      if (args.signal?.aborted) {
        ac.abort()
        throw new Error('cancelled')
      }
      const { value, done } = await reader.read()
      if (done) break

      pending += decoder.decode(value, { stream: true })

      const sentinelIdx = pending.indexOf(ERROR_SENTINEL)
      if (sentinelIdx !== -1) {
        // sentinel 이전까지는 정상 텍스트, 이후는 에러 메시지.
        const before = pending.slice(0, sentinelIdx)
        if (before) yield before
        const errMsg = pending
          .slice(sentinelIdx + ERROR_SENTINEL.length)
          .trim()
        throw new Error(errMsg || 'AI 변환 중 오류가 발생했습니다.')
      }

      // sentinel이 경계에 걸쳐 잘릴 가능성: 끝부분을 보류한다.
      const keep = ERROR_SENTINEL.length - 1
      if (pending.length > keep) {
        const emit = pending.slice(0, pending.length - keep)
        pending = pending.slice(pending.length - keep)
        if (emit) yield emit
      }
    }
    // 남은 tail flush (sentinel 없음 확정)
    if (pending) yield pending
  } finally {
    if (abortPoll) clearInterval(abortPoll)
    reader.releaseLock()
  }
}
