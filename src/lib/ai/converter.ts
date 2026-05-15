/**
 * PDF → Markdown 통합 변환 오케스트레이터
 *
 * 흐름 (P0-2 비전 폴백 + P0-3 동일 출처 프록시):
 *   1) extractPagesForAI(bytes) → 페이지별 { text, imageBase64? }
 *      - 텍스트 레이어가 있으면 text 사용
 *      - 텍스트가 없으면(스캔/이미지 PDF) 페이지를 PNG로 렌더해 비전 입력
 *   2) buildPageChunks(pages) → 멀티모달 content 파트 청크 배열
 *   3) provider 어댑터(프록시 경유)로 스트리밍 호출
 *      - 모든 외부 AI 호출은 `/api/ai/convert` 동일 출처 경유 (CORS·키노출 해소)
 *   4) 각 델타를 onChunk 콜백으로 전달 + 누적
 *   5) context_length 에러 시 텍스트 청크 크기를 절반으로 줄여 재시도
 *
 * BYOK: apiKey는 프록시 요청 본문으로만 전달되며 서버에 저장되지 않는다.
 */

import type { AIProvider } from '@/lib/types'

import type { AIContentPart } from './messages'
import { extractPagesForAI } from './page-extractor'
import {
  MAX_CHARS_PER_CHUNK,
  buildPageChunks,
} from './prompt'
import { streamWithClaude } from './providers/claude'
import { streamWithGemini } from './providers/gemini'
import { streamWithOpenAI } from './providers/openai'

/** 변환 범위 (P2-2). 미지정/'all'이면 전체 페이지 변환. */
export type ConvertScope = 'all' | 'current' | 'selected' | 'range'

/** 변환 범위 지정 옵션 (P2-2) */
export interface ConvertScopeOptions {
  /** 'all'(기본)=전체, 'current'/'selected'=pages, 'range'=pageRange */
  scope?: ConvertScope
  /** scope='current'/'selected'일 때 변환할 0-based 페이지 인덱스 목록 */
  pages?: number[]
  /** scope='range'일 때 0-based 포함 범위 (start..end) */
  pageRange?: { start: number; end: number }
}

/** 변환 중 취소 / 진행률 보고용 옵션 */
export interface ConvertOptions extends ConvertScopeOptions {
  /** 각 스트리밍 델타가 도착할 때마다 호출 */
  onChunk?: (delta: string, accumulated: string) => void
  /** 청크별 진행률 보고 (0.0 ~ 1.0) */
  onProgress?: (progress: number) => void
  /** AbortSignal-like: 외부에서 true로 바꾸면 즉시 중단 */
  signal?: { aborted: boolean }
}

/**
 * scope 옵션 → 0-based 페이지 인덱스 화이트리스트로 정규화한다 (P2-2).
 *
 *   - 'all' / 미지정         → undefined (전체 추출 = 비용 절감 없음)
 *   - 'current' / 'selected' → pages 배열 그대로 (중복 제거·정렬)
 *   - 'range'                → pageRange.start..end 펼침 (start>end 보정)
 *
 * 빈/모순 입력은 undefined로 폴백해 "전체 변환"으로 안전하게 처리한다.
 */
export function resolvePageIndices(
  opts: ConvertScopeOptions,
): number[] | undefined {
  const scope = opts.scope ?? 'all'
  if (scope === 'all') return undefined

  if (scope === 'range') {
    const r = opts.pageRange
    if (
      !r ||
      !Number.isInteger(r.start) ||
      !Number.isInteger(r.end)
    ) {
      return undefined
    }
    const start = Math.max(0, Math.min(r.start, r.end))
    const end = Math.max(r.start, r.end)
    const out: number[] = []
    for (let i = start; i <= end; i++) out.push(i)
    return out.length > 0 ? out : undefined
  }

  // 'current' | 'selected'
  const pages = opts.pages
  if (!pages || pages.length === 0) return undefined
  const set = new Set<number>()
  for (const p of pages) {
    if (Number.isInteger(p) && p >= 0) set.add(p)
  }
  if (set.size === 0) return undefined
  return Array.from(set).sort((a, b) => a - b)
}

/** 사용자에게 보일 정규화된 변환 에러 */
export interface ConvertErrorInfo {
  code:
    | 'INVALID_KEY'
    | 'RATE_LIMITED'
    | 'CONTEXT_TOO_LONG'
    | 'NETWORK'
    | 'CANCELLED'
    | 'UNKNOWN'
  message: string
}

/**
 * 단일 진입점: PDF 바이트 + 제공자 + 키 → Markdown 문자열.
 *
 * @throws Error (message는 한국어 사용자 메시지로 정규화됨)
 */
export async function convertPdfToMarkdown(
  bytes: Uint8Array,
  provider: AIProvider,
  apiKey: string,
  onChunk?: (delta: string, accumulated: string) => void,
  options: Omit<ConvertOptions, 'onChunk'> = {},
): Promise<string> {
  if (!apiKey) {
    throw createUserError('INVALID_KEY')
  }
  const signal = options.signal

  // P2-2: scope → 0-based 페이지 인덱스 화이트리스트.
  // undefined면 전체 페이지(기본). 지정 시 해당 페이지만 추출/렌더해
  // 토큰·비용을 절감한다. 비전 폴백(P0-2)은 선택 페이지에만 적용된다.
  const pageIndices = resolvePageIndices(options)

  // 1. PDF → 페이지별 텍스트 + (필요 시) 비전 이미지
  let pages: Awaited<ReturnType<typeof extractPagesForAI>>
  try {
    pages = await extractPagesForAI(bytes, { signal, pageIndices })
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    if (msg.toLowerCase().includes('cancel')) {
      throw createUserError('CANCELLED')
    }
    throw new Error(`PDF 페이지 추출 실패: ${msg}`)
  }

  if (pages.length === 0) {
    throw new Error('변환할 페이지가 없습니다.')
  }

  const hasAnyText = pages.some((p) => p.text.trim().length > 0)
  const hasAnyImage = pages.some((p) => typeof p.imageBase64 === 'string')
  if (!hasAnyText && !hasAnyImage) {
    throw new Error(
      '추출 가능한 텍스트가 없고 페이지 이미지 렌더에도 실패했습니다. ' +
        '다른 PDF로 시도하세요.',
    )
  }

  // 2. 청크 분할 + 스트리밍 호출 (필요 시 텍스트 청크 크기 자동 축소)
  let maxChars = MAX_CHARS_PER_CHUNK
  let attempt = 0
  const MAX_ATTEMPTS = 3

  while (attempt < MAX_ATTEMPTS) {
    attempt++
    if (signal?.aborted) throw createUserError('CANCELLED')

    const chunks = buildPageChunks(pages, maxChars)
    if (chunks.length === 0) {
      throw new Error(
        '추출된 텍스트가 없습니다. 스캔 PDF는 비전 변환에 실패했습니다.',
      )
    }
    let accumulated = ''

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) throw createUserError('CANCELLED')

        const content = buildChunkContent(
          chunks[i].content,
          i,
          chunks.length,
        )
        const stream = streamForProvider(
          provider,
          apiKey,
          content,
          signal,
        )

        for await (const delta of stream) {
          if (signal?.aborted) throw createUserError('CANCELLED')
          accumulated += delta
          onChunk?.(delta, accumulated)
        }

        // 청크 사이 구분 (다음 청크가 자연스럽게 이어지도록 줄바꿈 추가)
        if (i < chunks.length - 1 && !accumulated.endsWith('\n')) {
          accumulated += '\n\n'
          onChunk?.('\n\n', accumulated)
        }

        options.onProgress?.((i + 1) / chunks.length)
      }
      return accumulated
    } catch (e) {
      const err = e as Error
      const norm = normalizeError(err)

      // CANCELLED는 즉시 전파
      if (norm.code === 'CANCELLED') throw err

      // context_length는 텍스트 청크 크기를 줄여 재시도
      if (norm.code === 'CONTEXT_TOO_LONG' && attempt < MAX_ATTEMPTS) {
        maxChars = Math.max(8_000, Math.floor(maxChars / 2))
        continue
      }

      // 그 외는 사용자 메시지로 변환해 throw
      throw new Error(norm.message)
    }
  }

  throw new Error('변환 시도 횟수를 초과했습니다.')
}

/**
 * 멀티 청크 변환 시 청크 앞에 연속성 안내 텍스트 파트를 덧붙인다.
 * 단일 청크면 원본 그대로.
 */
function buildChunkContent(
  parts: AIContentPart[],
  index: number,
  total: number,
): AIContentPart[] {
  if (total <= 1) {
    return [
      { type: 'text', text: 'Convert the following PDF content to Markdown.' },
      ...parts,
    ]
  }
  if (index === 0) {
    return [
      {
        type: 'text',
        text:
          `Convert the following PDF content to Markdown. ` +
          `This is part 1 of ${total}. Subsequent parts continue from where you stop. ` +
          `Do not add closing remarks — just emit Markdown.`,
      },
      ...parts,
    ]
  }
  return [
    {
      type: 'text',
      text:
        `Continue converting the same PDF document. This is part ${index + 1} of ${total}. ` +
        `Keep the same Markdown style. Do not repeat previous content. ` +
        `Do not add headers like "Part ${index + 1}". Just continue.`,
    },
    ...parts,
  ]
}

/** provider 식별자 → 스트리밍 함수 디스패치 (프록시 경유) */
function streamForProvider(
  provider: AIProvider,
  apiKey: string,
  content: AIContentPart[],
  signal?: { aborted: boolean },
): AsyncGenerator<string, void, unknown> {
  switch (provider) {
    case 'claude':
      return streamWithClaude(apiKey, content, signal)
    case 'gemini':
      return streamWithGemini(apiKey, content, signal)
    case 'openai':
      return streamWithOpenAI(apiKey, content, signal)
    default: {
      const _exhaustive: never = provider
      throw new Error(`지원하지 않는 AI 제공자: ${String(_exhaustive)}`)
    }
  }
}

/**
 * 제공자 / 프록시 / fetch 에러를 사용자 친화적 메시지로 정규화.
 */
export function normalizeError(error: unknown): ConvertErrorInfo {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown')
  const lower = message.toLowerCase()

  if (lower.includes('aborted') || lower.includes('cancelled')) {
    return { code: 'CANCELLED', message: '변환이 취소되었습니다.' }
  }
  if (
    lower.includes('401') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication')
  ) {
    return { code: 'INVALID_KEY', message: 'API 키가 올바르지 않습니다.' }
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      code: 'RATE_LIMITED',
      message: '요청 한도를 초과했습니다. 잠시 후 재시도하세요.',
    }
  }
  if (
    lower.includes('context_length') ||
    lower.includes('context length') ||
    lower.includes('maximum context') ||
    lower.includes('too many tokens') ||
    lower.includes('too long')
  ) {
    return {
      code: 'CONTEXT_TOO_LONG',
      message: 'PDF가 너무 깁니다. 더 작은 청크로 재시도 중...',
    }
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network_error') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  ) {
    return {
      code: 'NETWORK',
      message: '네트워크 연결을 확인하세요. 오프라인 상태일 수 있습니다.',
    }
  }
  return { code: 'UNKNOWN', message: `변환 오류: ${message}` }
}

function createUserError(code: ConvertErrorInfo['code']): Error {
  switch (code) {
    case 'INVALID_KEY':
      return new Error('API 키가 올바르지 않습니다.')
    case 'RATE_LIMITED':
      return new Error('요청 한도를 초과했습니다. 잠시 후 재시도하세요.')
    case 'CONTEXT_TOO_LONG':
      return new Error('PDF가 너무 깁니다.')
    case 'NETWORK':
      return new Error('네트워크 연결을 확인하세요.')
    case 'CANCELLED':
      return new Error('변환이 취소되었습니다.')
    default:
      return new Error('알 수 없는 오류가 발생했습니다.')
  }
}
