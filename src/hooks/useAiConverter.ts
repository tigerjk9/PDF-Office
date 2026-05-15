/**
 * useAiConverter — PDF→Markdown AI 변환 상태 관리 React 훅
 *
 * 책임:
 *   - localStorage에서 BYO API 키 조회 (pdf-office-api-key-{provider})
 *   - convertPdfToMarkdown 호출 + 스트리밍 결과를 markdown 상태로 누적
 *   - 진행률 / 에러 / 취소 상태 노출
 *   - P2-2: 변환 범위(scope/pages/pageRange)를 변환 파이프라인에 전달
 *   - P2-7: 문서별 변환 결과 캐시(IndexedDB) — AI 도메인 단독 구현.
 *     store/conversionResults/partialize는 건드리지 않는다(engine 소유).
 *
 * 사용:
 *   const { markdown, isConverting, error, progress, convert, cancel,
 *           setApiKey, hasCachedResult, restoreCached, cachedAt } =
 *     useAiConverter()
 *   await convert(uint8Array, 'claude', { scope: 'range',
 *     pageRange: { start: 0, end: 4 }, docKey: 'a.pdf:1234:10' })
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AIProvider } from '@/lib/types'

import {
  convertPdfToMarkdown,
  normalizeError,
  type ConvertScope,
} from '@/lib/ai/converter'
import {
  cachedAtSync,
  getCached,
  hasCached,
  loadIndex,
  putCached,
} from '@/lib/ai/conversion-cache'

/** localStorage 키 빌더 (provider별 분리 저장) */
export const apiKeyStorageKey = (provider: AIProvider) =>
  `pdf-office-api-key-${provider}`

/**
 * convert()의 옵셔널 3번째 인자 (하위호환 — 미지정 시 기존 동작 동일).
 * P2-2 변환 범위 + P2-7 캐시 키.
 */
export interface ConvertCallOptions {
  /** 변환 범위 (P2-2). 미지정/'all'이면 전체 페이지 변환. */
  scope?: ConvertScope
  /** scope='current'/'selected'일 때 변환할 0-based 페이지 인덱스 목록 */
  pages?: number[]
  /** scope='range'일 때 0-based 포함 범위 (start..end) */
  pageRange?: { start: number; end: number }
  /** 제공 시 변환 성공 후 이 키로 결과를 캐시에 저장 (P2-7) */
  docKey?: string
}

export interface UseAiConverterReturn {
  /** 누적된 Markdown 문자열 (스트리밍 중 실시간 갱신) */
  markdown: string
  /** 변환 진행 여부 */
  isConverting: boolean
  /** 사용자에게 보여줄 한국어 에러 메시지 (없으면 null) */
  error: string | null
  /** 0.0 ~ 1.0 (청크 기준). 단일 청크면 스트림 진행 중에는 0 */
  progress: number
  /**
   * 변환 시작. provider별 키가 localStorage에 없으면 에러 set.
   * options(옵셔널, 하위호환): 변환 범위(P2-2) + 캐시 키(P2-7).
   */
  convert: (
    bytes: Uint8Array,
    provider: AIProvider,
    options?: ConvertCallOptions,
  ) => Promise<void>
  /** 진행 중인 변환 취소 */
  cancel: () => void
  /** API 키 저장 (메모리/네트워크에 흘리지 않음, localStorage만 사용) */
  setApiKey: (provider: AIProvider, key: string) => void
  /** API 키 조회 (입력 폼 사전 채움용) */
  getApiKey: (provider: AIProvider) => string | null
  /** API 키 삭제 */
  clearApiKey: (provider: AIProvider) => void
  /** markdown 결과 초기화 */
  reset: () => void
  /** 동기 — 해당 docKey의 캐시된 변환 결과 존재 여부 (P2-7) */
  hasCachedResult: (docKey: string) => boolean
  /** 캐시된 markdown을 markdown 상태로 복원 (P2-7, 본문은 비동기 로드) */
  restoreCached: (docKey: string) => void
  /** 동기 — 캐시 완료 시각(ms) 또는 null (P2-7) */
  cachedAt: (docKey: string) => number | null
}

export function useAiConverter(): UseAiConverterReturn {
  const [markdown, setMarkdown] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // signal 객체 — converter에 참조로 전달, cancel() 시 aborted=true
  const signalRef = useRef<{ aborted: boolean }>({ aborted: false })

  // P2-7: 마운트 시 캐시 키/메타 인덱스를 메모리로 1회 적재.
  // hasCachedResult/cachedAt 동기 응답을 위해 인덱스가 필요하다.
  // 적재 완료 후 1회 리렌더해 UI가 캐시 유무를 반영하도록 한다.
  const [, forceCacheTick] = useState(0)
  useEffect(() => {
    let mounted = true
    void loadIndex().then(() => {
      if (mounted) forceCacheTick((n) => n + 1)
    })
    return () => {
      mounted = false
    }
  }, [])

  const setApiKey = useCallback((provider: AIProvider, key: string) => {
    if (typeof window === 'undefined') return
    try {
      // 빈 문자열이면 삭제
      if (!key) window.localStorage.removeItem(apiKeyStorageKey(provider))
      else window.localStorage.setItem(apiKeyStorageKey(provider), key)
    } catch {
      // localStorage 접근 불가 (시크릿 모드 등)
    }
  }, [])

  const getApiKey = useCallback((provider: AIProvider): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(apiKeyStorageKey(provider))
    } catch {
      return null
    }
  }, [])

  const clearApiKey = useCallback(
    (provider: AIProvider) => {
      setApiKey(provider, '')
    },
    [setApiKey],
  )

  const reset = useCallback(() => {
    setMarkdown('')
    setError(null)
    setProgress(0)
  }, [])

  const cancel = useCallback(() => {
    signalRef.current.aborted = true
  }, [])

  const convert = useCallback(
    async (
      bytes: Uint8Array,
      provider: AIProvider,
      options?: ConvertCallOptions,
    ) => {
      const apiKey = getApiKey(provider)
      if (!apiKey) {
        setError('API 키를 먼저 입력하세요.')
        return
      }

      // 새 변환 시작 → 이전 상태 초기화
      signalRef.current = { aborted: false }
      setMarkdown('')
      setError(null)
      setProgress(0)
      setIsConverting(true)

      try {
        const result = await convertPdfToMarkdown(
          bytes,
          provider,
          apiKey,
          (_delta, accumulated) => {
            // 스트리밍 델타가 도착할 때마다 누적 문자열로 교체
            setMarkdown(accumulated)
          },
          {
            signal: signalRef.current,
            onProgress: (p) => setProgress(p),
            // P2-2: 변환 범위 전달 (미지정 시 converter가 전체로 폴백)
            scope: options?.scope,
            pages: options?.pages,
            pageRange: options?.pageRange,
          },
        )

        // P2-7: docKey 제공 시 변환 성공 결과를 캐시에 저장.
        // 취소되지 않았고 결과가 비어있지 않은 경우에만 저장한다.
        const docKey = options?.docKey
        if (docKey && !signalRef.current.aborted && result.trim()) {
          await putCached({
            key: docKey,
            markdown: result,
            provider,
            completedAt: Date.now(),
          })
          // 동기 조회가 즉시 반영되도록 리렌더 트리거
          forceCacheTick((n) => n + 1)
        }
      } catch (e) {
        const norm = normalizeError(e)
        if (norm.code !== 'CANCELLED') {
          setError(norm.message)
        }
      } finally {
        setIsConverting(false)
      }
    },
    [getApiKey],
  )

  const hasCachedResult = useCallback((docKey: string): boolean => {
    return hasCached(docKey)
  }, [])

  const cachedAt = useCallback((docKey: string): number | null => {
    return cachedAtSync(docKey)
  }, [])

  const restoreCached = useCallback((docKey: string) => {
    // 본문은 IndexedDB라 비동기. 읽어온 뒤 markdown 상태로 로드.
    void getCached(docKey).then((entry) => {
      if (entry && entry.markdown) {
        setMarkdown(entry.markdown)
        setError(null)
        setProgress(1)
      }
    })
  }, [])

  return {
    markdown,
    isConverting,
    error,
    progress,
    convert,
    cancel,
    setApiKey,
    getApiKey,
    clearApiKey,
    reset,
    hasCachedResult,
    restoreCached,
    cachedAt,
  }
}
