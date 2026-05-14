/**
 * useAiConverter — PDF→Markdown AI 변환 상태 관리 React 훅
 *
 * 책임:
 *   - localStorage에서 BYO API 키 조회 (pdf-office-api-key-{provider})
 *   - convertPdfToMarkdown 호출 + 스트리밍 결과를 markdown 상태로 누적
 *   - 진행률 / 에러 / 취소 상태 노출
 *
 * 사용:
 *   const { markdown, isConverting, error, progress, convert, cancel,
 *           setApiKey } = useAiConverter()
 *   await convert(uint8Array, 'claude')
 */

'use client'

import { useCallback, useRef, useState } from 'react'

import type { AIProvider } from '@/lib/types'

import { convertPdfToMarkdown, normalizeError } from '@/lib/ai/converter'

/** localStorage 키 빌더 (provider별 분리 저장) */
export const apiKeyStorageKey = (provider: AIProvider) =>
  `pdf-office-api-key-${provider}`

export interface UseAiConverterReturn {
  /** 누적된 Markdown 문자열 (스트리밍 중 실시간 갱신) */
  markdown: string
  /** 변환 진행 여부 */
  isConverting: boolean
  /** 사용자에게 보여줄 한국어 에러 메시지 (없으면 null) */
  error: string | null
  /** 0.0 ~ 1.0 (청크 기준). 단일 청크면 스트림 진행 중에는 0 */
  progress: number
  /** 변환 시작. provider별 키가 localStorage에 없으면 에러 set. */
  convert: (bytes: Uint8Array, provider: AIProvider) => Promise<void>
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
}

export function useAiConverter(): UseAiConverterReturn {
  const [markdown, setMarkdown] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // signal 객체 — converter에 참조로 전달, cancel() 시 aborted=true
  const signalRef = useRef<{ aborted: boolean }>({ aborted: false })

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
    async (bytes: Uint8Array, provider: AIProvider) => {
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
        await convertPdfToMarkdown(
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
          },
        )
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
  }
}
