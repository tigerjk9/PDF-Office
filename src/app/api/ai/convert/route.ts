/**
 * 동일 출처 AI 변환 프록시 (P0-3)
 *
 * 클라이언트는 `fetch('/api/ai/convert', { method: 'POST', body })`로
 * 동일 출처 호출한다. 이 라우트가 서버에서 각 공급자
 * (Claude / OpenAI / Gemini) API를 호출하므로 브라우저 CORS·키 노출 문제를
 * 제거한다.
 *
 * BYOK: 사용자 API 키는 요청 본문으로 받아 공급자 호출에만 사용한다.
 *   - 서버에 저장하지 않는다 (DB/파일/캐시 없음).
 *   - 로그/에러 메시지에 키를 포함하지 않는다.
 *
 * 스트리밍: 공급자 SSE를 서버에서 파싱해 "순수 텍스트 델타"만 골라
 * ReadableStream으로 그대로 흘려보낸다(passthrough). 클라이언트는
 * 별도 SSE 파싱 없이 chunk를 누적하면 된다 → converter.ts의 onChunk
 * 누적 패턴을 그대로 유지한다.
 *
 * 런타임: Node.js (Edge 아님). 외부 API로의 fetch 스트리밍 + 큰 페이로드
 * (스캔 PDF base64 이미지) 처리를 위해 nodejs 런타임을 명시한다.
 */

import type { AIContentPart, AIConvertRequest } from '@/lib/ai/messages'
import { streamClaude } from '@/lib/ai/server/claude'
import { streamGemini } from '@/lib/ai/server/gemini'
import { streamOpenAI } from '@/lib/ai/server/openai'

export const runtime = 'nodejs'
// 스트리밍 응답이므로 정적 최적화/캐싱 비활성
export const dynamic = 'force-dynamic'

/** 요청 본문 검증 결과 */
type ValidatedBody =
  | { ok: true; value: AIConvertRequest }
  | { ok: false; error: string }

function validateBody(raw: unknown): ValidatedBody {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '잘못된 요청 본문입니다.' }
  }
  const b = raw as Record<string, unknown>

  const provider = b.provider
  if (provider !== 'claude' && provider !== 'gemini' && provider !== 'openai') {
    return { ok: false, error: '지원하지 않는 AI 제공자입니다.' }
  }

  const apiKey = b.apiKey
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return { ok: false, error: 'API 키가 필요합니다.' }
  }

  const system = b.system
  if (typeof system !== 'string') {
    return { ok: false, error: '시스템 프롬프트가 누락되었습니다.' }
  }

  const content = b.content
  if (!Array.isArray(content) || content.length === 0) {
    return { ok: false, error: '변환할 콘텐츠가 비어 있습니다.' }
  }
  for (const part of content as unknown[]) {
    if (!part || typeof part !== 'object') {
      return { ok: false, error: '잘못된 콘텐츠 형식입니다.' }
    }
    const p = part as Record<string, unknown>
    if (p.type === 'text') {
      if (typeof p.text !== 'string') {
        return { ok: false, error: '잘못된 텍스트 파트입니다.' }
      }
    } else if (p.type === 'image') {
      if (
        (p.mediaType !== 'image/png' && p.mediaType !== 'image/jpeg') ||
        typeof p.data !== 'string'
      ) {
        return { ok: false, error: '잘못된 이미지 파트입니다.' }
      }
    } else {
      return { ok: false, error: '알 수 없는 콘텐츠 파트 타입입니다.' }
    }
  }

  return {
    ok: true,
    value: {
      provider,
      apiKey,
      system,
      content: content as AIContentPart[],
    },
  }
}

function pickStream(
  req: AIConvertRequest,
): AsyncGenerator<string, void, unknown> {
  switch (req.provider) {
    case 'claude':
      return streamClaude(req.apiKey, req.system, req.content)
    case 'openai':
      return streamOpenAI(req.apiKey, req.system, req.content)
    case 'gemini':
      return streamGemini(req.apiKey, req.system, req.content)
  }
}

/**
 * 에러 메시지에서 API 키가 새지 않도록 마스킹한다.
 * (공급자 에러 본문이 키를 echo back 하는 드문 경우 방어)
 */
function sanitize(message: string, apiKey: string): string {
  if (!apiKey) return message
  return message.split(apiKey).join('***')
}

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return new Response(
      JSON.stringify({ error: '요청 본문 파싱에 실패했습니다.' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  const validated = validateBody(parsed)
  if (!validated.ok) {
    return new Response(JSON.stringify({ error: validated.error }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const reqBody = validated.value
  const apiKey = reqBody.apiKey

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of pickStream(reqBody)) {
          controller.enqueue(encoder.encode(delta))
        }
        controller.close()
      } catch (e) {
        // 스트림 도중 에러: 키를 마스킹한 메시지를 본문 끝에 텍스트로 주입.
        // 클라이언트(converter.ts)는 status 200이라도 본문 sentinel을 감지해
        // 에러로 처리한다.
        const rawMsg =
          e instanceof Error ? e.message : String(e ?? 'unknown error')
        const safeMsg = sanitize(rawMsg, apiKey)
        try {
          controller.enqueue(
            encoder.encode(`\n\n__AI_PROXY_ERROR__:${safeMsg}`),
          )
        } catch {
          /* controller가 이미 닫힌 경우 무시 */
        }
        controller.close()
      }
      // 주의: apiKey는 어디에도 console.log/저장하지 않는다.
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
