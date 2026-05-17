/**
 * useKeyboardShortcuts — 전역 키보드 단축키 핸들러 (P1-14)
 *
 * 등록 단축키:
 *   - ← / →           : 이전 / 다음 페이지
 *   - ↑ / ↓ / PageUp / PageDown / Space / Home / End : 연속 모드 페이지 스크롤
 *   - Delete / Backspace: 선택 페이지 삭제 요청(확인 다이얼로그 경유)
 *   - Ctrl/Cmd+Z       : 실행취소
 *   - Ctrl/Cmd+Shift+Z : 다시실행
 *   - Ctrl+Y           : 다시실행
 *   - Ctrl/Cmd+A       : 전체 페이지 선택
 *   - Esc              : 선택 해제
 *
 * 입력 필드(input/textarea/contentEditable) 포커스 시 단축키 비활성화.
 * UI 전용 훅 — 스토어 액션을 소비만 한다.
 */

'use client'

import { useEffect } from 'react'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { usePageManager } from '@/hooks/usePageManager'

interface UseKeyboardShortcutsArgs {
  /** 활성화 여부 (문서 없을 땐 false 권장) */
  enabled: boolean
  /** 선택 페이지 삭제 요청 (확인 다이얼로그 경유) */
  onRequestDelete: (indices: number[]) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts({
  enabled,
  onRequestDelete,
}: UseKeyboardShortcutsArgs): void {
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  const clearSelection = usePdfStore((s) => s.clearSelection)
  const undo = usePdfStore((s) => s.undo)
  const redo = usePdfStore((s) => s.redo)
  const activeDoc = usePdfStore(selectActiveDoc)
  const { selectAll, selectedPages } = usePageManager()

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      const mod = e.ctrlKey || e.metaKey
      const pageCount = activeDoc?.pageCount ?? 0

      // Undo / Redo
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        redo()
        return
      }

      // 전체 선택
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        selectAll()
        return
      }

      // 선택 해제
      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      // 페이지 이동
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentPage(Math.max(0, currentPageIndex - 1))
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentPage(Math.min(pageCount - 1, currentPageIndex + 1))
        return
      }

      // 연속 모드 스크롤 키: ↑/PageUp 이전, ↓/PageDown/Space 다음, Home/End 처음·끝
      if (viewMode === 'continuous') {
        // Space 는 포커스된 버튼/링크의 표준 활성화 키 → 그 경우 가로채지 않음
        const ae = document.activeElement
        const onInteractive =
          ae instanceof HTMLElement &&
          (ae.tagName === 'BUTTON' ||
            ae.tagName === 'A' ||
            ae.getAttribute('role') === 'button')
        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault()
          setCurrentPage(Math.max(0, currentPageIndex - 1))
          return
        }
        if (
          e.key === 'ArrowDown' ||
          e.key === 'PageDown' ||
          ((e.key === ' ' || e.key === 'Spacebar') && !onInteractive)
        ) {
          e.preventDefault()
          setCurrentPage(Math.min(pageCount - 1, currentPageIndex + 1))
          return
        }
        if (e.key === 'Home') {
          e.preventDefault()
          setCurrentPage(0)
          return
        }
        if (e.key === 'End') {
          e.preventDefault()
          setCurrentPage(Math.max(0, pageCount - 1))
          return
        }
      }

      // 삭제 (확인 다이얼로그 경유)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPages.length > 0) {
          e.preventDefault()
          onRequestDelete([...selectedPages])
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    enabled,
    activeDoc,
    currentPageIndex,
    selectedPages,
    setCurrentPage,
    clearSelection,
    undo,
    redo,
    selectAll,
    onRequestDelete,
    viewMode,
  ])
}
