/**
 * usePageManager — 페이지 조작 훅 (삭제/순서변경/회전/선택)
 *
 * 책임:
 *   - 다중 선택 상태 (selectedPages)
 *   - 페이지 삭제/회전/순서변경 액션 래핑
 *   - 선택된 페이지 일괄 처리
 *
 * 사용:
 *   const { selectedPages, deleteSelected, rotate, reorder, ... } = usePageManager()
 */

'use client'

import { useCallback } from 'react'
import {
  usePdfStore,
  selectActiveDoc,
  selectIsAnySelected,
} from '@/lib/store/pdf-store'
import type { ApplyOperationResult, PageIndex } from '@/lib/types'

export interface UsePageManagerReturn {
  /** 현재 선택된 페이지 인덱스 (정렬됨) */
  selectedPages: PageIndex[]
  /** 선택된 페이지가 1개 이상인지 */
  hasSelection: boolean
  /** 활성 문서의 페이지 수 */
  pageCount: number

  // ----- 선택 액션 -----
  toggle: (pageIndex: PageIndex) => void
  select: (pageIndices: PageIndex[]) => void
  clearSelection: () => void
  selectAll: () => void
  selectRange: (from: PageIndex, to: PageIndex) => void

  // ----- 페이지 조작 -----
  /** 단일 페이지 삭제 */
  deletePage: (pageIndex: PageIndex) => Promise<ApplyOperationResult>
  /** 선택된 페이지 일괄 삭제 */
  deleteSelected: () => Promise<ApplyOperationResult | null>
  /** 단일 페이지 회전 (90/180/270도) */
  rotatePage: (
    pageIndex: PageIndex,
    degrees: 90 | 180 | 270,
  ) => Promise<ApplyOperationResult>
  /** 선택된 페이지들 일괄 회전 */
  rotateSelected: (degrees: 90 | 180 | 270) => Promise<ApplyOperationResult[]>
  /** 페이지 순서 변경 */
  reorder: (newOrder: PageIndex[]) => Promise<ApplyOperationResult>
  /**
   * 단일 페이지를 from → to 위치로 이동 (dnd-kit drag-end 헬퍼).
   * 내부에서 newOrder 배열을 생성하여 reorder 호출.
   */
  movePage: (from: PageIndex, to: PageIndex) => Promise<ApplyOperationResult | null>

  // ----- 내보내기 -----
  exportActive: (fileName?: string) => Promise<void>
}

export function usePageManager(): UsePageManagerReturn {
  const activeDoc = usePdfStore(selectActiveDoc)
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const hasSelection = usePdfStore(selectIsAnySelected)

  const toggle = usePdfStore((s) => s.togglePageSelection)
  const select = usePdfStore((s) => s.selectPages)
  const clearSelection = usePdfStore((s) => s.clearSelection)
  const applyOperation = usePdfStore((s) => s.applyOperation)
  const exportDocument = usePdfStore((s) => s.exportDocument)

  const pageCount = activeDoc?.pageCount ?? 0

  const selectAll = useCallback(() => {
    if (!activeDoc) return
    select(Array.from({ length: activeDoc.pageCount }, (_, i) => i))
  }, [activeDoc, select])

  const selectRange = useCallback(
    (from: PageIndex, to: PageIndex) => {
      if (!activeDoc) return
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      const range: PageIndex[] = []
      for (let i = lo; i <= hi; i++) range.push(i)
      select(range)
    },
    [activeDoc, select],
  )

  const deletePage = useCallback(
    async (pageIndex: PageIndex) => {
      if (!activeDoc) {
        return {
          success: false,
          error: {
            code: 'OPERATION_FAILED' as const,
            message: '활성 문서가 없습니다.',
            recoverable: false,
          },
        }
      }
      return applyOperation({
        type: 'delete',
        docId: activeDoc.id,
        pageIndices: [pageIndex],
      })
    },
    [activeDoc, applyOperation],
  )

  const deleteSelected = useCallback(async () => {
    if (!activeDoc || selectedPages.length === 0) return null
    return applyOperation({
      type: 'delete',
      docId: activeDoc.id,
      pageIndices: [...selectedPages],
    })
  }, [activeDoc, selectedPages, applyOperation])

  const rotatePage = useCallback(
    async (pageIndex: PageIndex, degrees: 90 | 180 | 270) => {
      if (!activeDoc) {
        return {
          success: false,
          error: {
            code: 'OPERATION_FAILED' as const,
            message: '활성 문서가 없습니다.',
            recoverable: false,
          },
        }
      }
      return applyOperation({
        type: 'rotate',
        docId: activeDoc.id,
        pageIndex,
        degrees,
      })
    },
    [activeDoc, applyOperation],
  )

  const rotateSelected = useCallback(
    async (degrees: 90 | 180 | 270) => {
      if (!activeDoc || selectedPages.length === 0) return []
      const results: ApplyOperationResult[] = []
      // 회전은 페이지 인덱스가 유지되므로 순차 적용 가능
      for (const pageIndex of selectedPages) {
        // eslint-disable-next-line no-await-in-loop
        const r = await applyOperation({
          type: 'rotate',
          docId: activeDoc.id,
          pageIndex,
          degrees,
        })
        results.push(r)
        if (!r.success) break
      }
      return results
    },
    [activeDoc, selectedPages, applyOperation],
  )

  const reorder = useCallback(
    async (newOrder: PageIndex[]) => {
      if (!activeDoc) {
        return {
          success: false,
          error: {
            code: 'OPERATION_FAILED' as const,
            message: '활성 문서가 없습니다.',
            recoverable: false,
          },
        }
      }
      return applyOperation({
        type: 'reorder',
        docId: activeDoc.id,
        newOrder,
      })
    },
    [activeDoc, applyOperation],
  )

  const movePage = useCallback(
    async (from: PageIndex, to: PageIndex) => {
      if (!activeDoc) return null
      if (from === to) return null
      const indices = Array.from({ length: activeDoc.pageCount }, (_, i) => i)
      const [moved] = indices.splice(from, 1)
      indices.splice(to, 0, moved)
      return reorder(indices)
    },
    [activeDoc, reorder],
  )

  const exportActive = useCallback(
    async (fileName?: string) => {
      if (!activeDoc) return
      await exportDocument(activeDoc.id, fileName)
    },
    [activeDoc, exportDocument],
  )

  return {
    selectedPages,
    hasSelection,
    pageCount,
    toggle,
    select,
    clearSelection,
    selectAll,
    selectRange,
    deletePage,
    deleteSelected,
    rotatePage,
    rotateSelected,
    reorder,
    movePage,
    exportActive,
  }
}
