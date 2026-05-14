/**
 * PDF → Markdown 통합 변환 오케스트레이터
 *
 * 흐름:
 *   1) extractTextFromPdf(bytes) → 전체 텍스트
 *   2) splitIntoChunks(text)     → 청크 배열
 *   3) provider 어댑터 스트리밍 호출 (Claude / Gemini / OpenAI)
 *   4) 각 델타를 onChunk 콜백으로 전달 + 누적
 *   5) context_length 에러 발생 시 청크 크기를 절반으로 줄여 재시도
 */

import type { AIProvider } from '@/lib/types'

import { extractTextFromPdf } from './extractor'
import {
  MAX_CHARS_PER_CHUNK,
  buildUserMessage,
  splitIntoChunks,
} from './prompt'
import { streamWithClaude } from './providers/claude'
import { streamWithGemini } from './providers/gemini'
import { streamWithOpenAI } from './providers/openai'

/** 변환 중 취소 / 진행률 보고용 옵션 */
export interface ConvertOptions {
  /** 각 스트리밍 델타가 도착할 때마다 호출 */
  onChunk?: (delta: string, accumulated: string) => void
  /** 청크별 진행률 보고 (0.0 ~ 1.0) */
  onProgress?: (progress: number) => void
  /** AbortSignal-like: 외부에서 true로 바꾸면 즉시 중단 */
  signal?: { aborted: boolean }
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

  // 1. PDF → 텍스트
  let fullText: string
  try {
    fullText = await extractTextFromPdf(bytes)
  } catch (e) {
    throw new Error(`PDF 텍스트 추출 실패: ${(e as Error).message ?? e}`)
  }

  if (!fullText.trim()) {
    throw new Error(
      '추출된 텍스트가 없습니다. 스캔 PDF는 OCR이 필요합니다.',
    )
  }

  // 2. 청크 분할 + 스트리밍 호출 (필요 시 청크 크기 자동 축소)
  let maxChars = MAX_CHARS_PER_CHUNK
  let attempt = 0
  const MAX_ATTEMPTS = 3

  // 청크 크기 축소를 외부 루프로 감싸 'context_length' 발생 시 재시도.
  // 한 청크 안에서 실패하면 처음부터 다시 시작한다 (전체 일관성 보장).
  while (attempt < MAX_ATTEMPTS) {
    attempt++
    if (signal?.aborted) throw createUserError('CANCELLED')

    const chunks = splitIntoChunks(fullText, maxChars)
    let accumulated = ''

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) throw createUserError('CANCELLED')

        const userMessage = buildUserMessage(chunks[i], i, chunks.length)
        const stream = streamForProvider(provider, apiKey, userMessage)

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

      // context_length는 청크 크기를 줄여 재시도
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

/** provider 식별자 → 스트리밍 함수 디스패치 */
function streamForProvider(
  provider: AIProvider,
  apiKey: string,
  text: string,
): AsyncGenerator<string, void, unknown> {
  switch (provider) {
    case 'claude':
      return streamWithClaude(apiKey, text)
    case 'gemini':
      return streamWithGemini(apiKey, text)
    case 'openai':
      return streamWithOpenAI(apiKey, text)
    default: {
      const _exhaustive: never = provider
      throw new Error(`지원하지 않는 AI 제공자: ${String(_exhaustive)}`)
    }
  }
}

/**
 * 제공자 SDK / fetch 에러를 사용자 친화적 메시지로 정규화.
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
    lower.includes('too many tokens')
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
