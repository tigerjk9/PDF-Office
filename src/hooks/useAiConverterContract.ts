/**
 * useAiConverterContract — useAiConverter 동결 계약의 UI 소비 브리지 (P2-2 / P2-7)
 *
 * 배경:
 *   ai 도메인이 `useAiConverter`를 아래 형태로 확장 중이다(병렬 작업).
 *   기존 멤버는 불변이며 신규 멤버가 추가된다:
 *     - convert(bytes, provider, options?) — options?: {scope?, pages?, pageRange?, docKey?}
 *     - hasCachedResult(docKey): boolean
 *     - restoreCached(docKey): void | Promise<void>
 *     - cachedAt(docKey): number | null
 *
 *   `src/hooks/useAiConverter.ts`는 ai 단독 소유라 UI가 수정할 수 없고,
 *   확장 멤버가 아직 미착륙일 수 있다. UI 코드를 타입 안전하게 유지하기
 *   위해 계약 형태를 이 UI 전용 파일에 명시하고 런타임에서는 실제 훅의
 *   반환값을 그대로 위임한다. (PageThumbnail의 동결 prop 확장과 동일 패턴.)
 *
 *   docKey 계산식(계약 필수 일치):
 *     `${activeDoc.name}:${activeDoc.sizeBytes}:${activeDoc.pageCount}`
 *
 * 절대 규칙: 이 파일은 계약을 "소비"만 한다. lib/ai·useAiConverter 미수정.
 */

'use client'

import { useAiConverter } from '@/hooks/useAiConverter'
import type { AIProvider, PageIndex } from '@/lib/types'

/** 변환 범위 (P2-2). 'range'면 pageRange, 'selected'/'current'면 pages 사용. */
export type ConvertScope = 'all' | 'current' | 'selected' | 'range'

/** convert()의 옵션 — 동결 계약 형태와 정확히 일치. */
export interface ConvertOptions {
  scope?: ConvertScope
  /** scope='selected'/'current'일 때 변환할 0-based 페이지 인덱스 */
  pages?: PageIndex[]
  /** scope='range'일 때 (start..end, 0-based 포함 범위) */
  pageRange?: { start: PageIndex; end: PageIndex }
  /** 변환 결과 캐시 키 (P2-7). 미지정 시 캐시 비활성. */
  docKey?: string
}

/**
 * UI가 소비하는 useAiConverter 계약 표면.
 * 기존 멤버 + ai가 추가하는 신규 멤버를 모두 명시한다.
 */
export interface AiConverterContract {
  markdown: string
  isConverting: boolean
  error: string | null
  progress: number
  /** 신규: 세 번째 인자로 변환 범위/캐시 옵션 전달 (P2-2 / P2-7) */
  convert: (
    bytes: Uint8Array,
    provider: AIProvider,
    options?: ConvertOptions,
  ) => Promise<void>
  cancel: () => void
  setApiKey: (provider: AIProvider, key: string) => void
  getApiKey: (provider: AIProvider) => string | null
  /** 신규: docKey에 캐시된 변환 결과가 있는지 (P2-7) */
  hasCachedResult: (docKey: string) => boolean
  /** 신규: 캐시된 결과를 markdown 상태로 복원 (P2-7) */
  restoreCached: (docKey: string) => void | Promise<void>
  /** 신규: 캐시 완료 시각(epoch ms) 또는 null (P2-7) */
  cachedAt: (docKey: string) => number | null
}

/** activeDoc 식별 정보로부터 docKey를 계산한다(계약 필수 일치). */
export function computeDocKey(doc: {
  name: string
  sizeBytes: number
  pageCount: number
}): string {
  return `${doc.name}:${doc.sizeBytes}:${doc.pageCount}`
}

/** 런타임 안전 폴백: 확장 멤버가 아직 미착륙일 때 no-op 처리. */
function withFallback(raw: Record<string, unknown>): AiConverterContract {
  const noopHas = (_k: string) => false
  const noopRestore = (_k: string) => undefined
  const noopCachedAt = (_k: string): number | null => null

  return {
    markdown: (raw.markdown as string) ?? '',
    isConverting: Boolean(raw.isConverting),
    error: (raw.error as string | null) ?? null,
    progress: (raw.progress as number) ?? 0,
    convert: raw.convert as AiConverterContract['convert'],
    cancel: raw.cancel as AiConverterContract['cancel'],
    setApiKey: raw.setApiKey as AiConverterContract['setApiKey'],
    getApiKey: raw.getApiKey as AiConverterContract['getApiKey'],
    hasCachedResult:
      (raw.hasCachedResult as AiConverterContract['hasCachedResult']) ??
      noopHas,
    restoreCached:
      (raw.restoreCached as AiConverterContract['restoreCached']) ??
      noopRestore,
    cachedAt:
      (raw.cachedAt as AiConverterContract['cachedAt']) ?? noopCachedAt,
  }
}

/**
 * useAiConverter를 계약 형태로 소비한다.
 * 실제 훅 반환값을 그대로 위임하되, 미착륙 확장 멤버는 안전한
 * no-op으로 폴백해 UI가 깨지지 않도록 한다.
 */
export function useAiConverterContract(): AiConverterContract {
  const raw = useAiConverter() as unknown as Record<string, unknown>
  return withFallback(raw)
}
