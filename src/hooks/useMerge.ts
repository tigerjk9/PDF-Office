/**
 * useMerge — PDF 병합 훅
 *
 * 책임:
 *   - 병합할 문서 ID 리스트 관리 (순서 = 결과 순서)
 *   - 병합 실행 → 새 문서 생성 → activeDoc로 전환
 *
 * 사용:
 *   const { mergeList, addToMerge, removeFromMerge, reorderMerge,
 *           canMerge, runMerge } = useMerge()
 */

'use client'

import { useCallback, useState } from 'react'
import { usePdfStore, selectCanMerge } from '@/lib/store/pdf-store'
import type { ApplyOperationResult, DocId } from '@/lib/types'

export interface UseMergeReturn {
  /** 병합 대기 문서 ID 리스트 (순서 = 결과 페이지 순서) */
  mergeList: DocId[]
  /** 병합 가능 여부 (문서가 2개 이상) */
  canMerge: boolean
  /** 병합 리스트에 문서 추가 (중복 무시) */
  addToMerge: (docId: DocId) => void
  /** 병합 리스트에서 문서 제거 */
  removeFromMerge: (docId: DocId) => void
  /** 병합 리스트 순서 변경 */
  reorderMerge: (from: number, to: number) => void
  /** 리스트 초기화 */
  clearMergeList: () => void
  /** 병합 리스트 전체 교체 (dnd-kit 결과 반영용) */
  setMergeList: (docIds: DocId[]) => void
  /** 병합 실행 — 최소 2개의 문서 필요 */
  runMerge: (outputName?: string) => Promise<ApplyOperationResult | null>
  /** 진행 상태 */
  isLoading: boolean
}

export function useMerge(): UseMergeReturn {
  const [mergeList, setMergeListState] = useState<DocId[]>([])

  const documents = usePdfStore((s) => s.documents)
  const isLoading = usePdfStore((s) => s.isLoading)
  const canMergeStore = usePdfStore(selectCanMerge)
  const applyOperation = usePdfStore((s) => s.applyOperation)

  const addToMerge = useCallback(
    (docId: DocId) => {
      setMergeListState((prev) => (prev.includes(docId) ? prev : [...prev, docId]))
    },
    [],
  )

  const removeFromMerge = useCallback((docId: DocId) => {
    setMergeListState((prev) => prev.filter((id) => id !== docId))
  }, [])

  const reorderMerge = useCallback((from: number, to: number) => {
    setMergeListState((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) {
        return prev
      }
      if (from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const clearMergeList = useCallback(() => setMergeListState([]), [])

  const setMergeList = useCallback((docIds: DocId[]) => {
    // 유효한 문서 ID만 통과
    const validIds = new Set(documents.map((d) => d.id))
    setMergeListState(docIds.filter((id) => validIds.has(id)))
  }, [documents])

  const runMerge = useCallback(
    async (outputName?: string): Promise<ApplyOperationResult | null> => {
      if (mergeList.length < 2) {
        return {
          success: false,
          error: {
            code: 'OPERATION_FAILED',
            message: '병합하려면 2개 이상의 문서가 필요합니다.',
            recoverable: true,
          },
        }
      }
      const result = await applyOperation({
        type: 'merge',
        docIds: mergeList,
        outputName,
      })
      if (result.success) {
        // 성공 시 병합 리스트 초기화
        setMergeListState([])
      }
      return result
    },
    [mergeList, applyOperation],
  )

  // canMerge: 스토어의 전체 문서 수 ≥ 2 + 현재 리스트 ≥ 2 둘 다 충족 필요
  const canMerge = canMergeStore && mergeList.length >= 2

  return {
    mergeList,
    canMerge,
    addToMerge,
    removeFromMerge,
    reorderMerge,
    clearMergeList,
    setMergeList,
    runMerge,
    isLoading,
  }
}
