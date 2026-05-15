/**
 * usePageDeletion — 페이지 삭제 확인 + 실행 + 실행취소 토스트 (P1-8)
 *
 * 흐름:
 *   1. requestDelete(indices)  → 확인 다이얼로그 오픈 (pending 보관)
 *   2. confirmDelete()         → applyOperation(delete) 실행
 *   3. 성공 시 sonner 토스트("삭제됨 · 실행취소" 액션 버튼)
 *   4. 토스트의 실행취소 → store.undo()
 *
 * 즉시 삭제 금지: 항상 다이얼로그를 거친다.
 * UI 전용 훅 — 스토어/엔진 액션을 소비만 한다.
 */

'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { PageIndex } from '@/lib/types'

export interface UsePageDeletionReturn {
  /** 확인 다이얼로그 표시 여부 */
  confirmOpen: boolean
  setConfirmOpen: (open: boolean) => void
  /** 삭제 대기 페이지 인덱스 (확인 대기 중) */
  pendingIndices: PageIndex[]
  /** 삭제 요청 — 다이얼로그를 연다 */
  requestDelete: (indices: PageIndex[]) => void
  /** 다이얼로그에서 확인됨 — 실제 삭제 실행 */
  confirmDelete: () => void
  /** 다이얼로그에 표시할 안내 문구 */
  description: string
}

export function usePageDeletion(): UsePageDeletionReturn {
  const activeDoc = usePdfStore(selectActiveDoc)
  const applyOperation = usePdfStore((s) => s.applyOperation)
  const undo = usePdfStore((s) => s.undo)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingIndices, setPendingIndices] = useState<PageIndex[]>([])

  const requestDelete = useCallback((indices: PageIndex[]) => {
    if (indices.length === 0) return
    setPendingIndices([...indices].sort((a, b) => a - b))
    setConfirmOpen(true)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!activeDoc || pendingIndices.length === 0) return
    const count = pendingIndices.length
    const indices = [...pendingIndices]
    setConfirmOpen(false)
    setPendingIndices([])

    void applyOperation({
      type: 'delete',
      docId: activeDoc.id,
      pageIndices: indices,
    }).then((result) => {
      if (result.success) {
        toast.success(`${count}개 페이지가 삭제되었습니다`, {
          description: '실행취소로 되돌릴 수 있습니다.',
          action: {
            label: '실행취소',
            onClick: () => undo(),
          },
        })
      } else {
        toast.error('삭제에 실패했습니다', {
          description:
            result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
        })
      }
    })
  }, [activeDoc, pendingIndices, applyOperation, undo])

  const count = pendingIndices.length
  const description =
    count > 0
      ? `선택한 ${count}개 페이지를 삭제합니다. 이 작업은 실행취소(Ctrl+Z)로 되돌릴 수 있습니다.`
      : ''

  return {
    confirmOpen,
    setConfirmOpen,
    pendingIndices,
    requestDelete,
    confirmDelete,
    description,
  }
}
