'use client'

import { useCallback, useRef, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { PageThumbnail, type SelectModifier } from '@/components/pages/PageThumbnail'
import { usePageManager } from '@/hooks/usePageManager'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { PageIndex } from '@/lib/types'

interface PageGridProps {
  /** 페이지 삭제 요청 → 상위에서 확인 다이얼로그 경유 (P1-8) */
  onRequestDelete?: (indices: PageIndex[]) => void
}

/**
 * 활성 문서의 페이지 썸네일 그리드.
 *
 * 선택 UX (P1-5):
 *  - 일반 클릭: 단일 선택 + 뷰어 이동, anchor 갱신
 *  - Ctrl/Cmd 클릭: 토글, anchor 갱신
 *  - Shift 클릭: anchor ~ 현재 인덱스 범위 선택
 *
 * 순서 변경 (P1-7):
 *  - 드래그 핸들 → 네이티브 HTML5 DnD → usePageManager.movePage
 *  - 드롭 위치 인디케이터(before/after) 표시
 */
export function PageGrid({ onRequestDelete }: PageGridProps) {
  const activeDoc = usePdfStore(selectActiveDoc)
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const selectPages = usePdfStore((s) => s.selectPages)
  const togglePageSelection = usePdfStore((s) => s.togglePageSelection)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)

  const { selectRange, rotatePage, movePage } = usePageManager()

  // 범위 선택 기준점 (마지막 단일/토글 선택 인덱스)
  const anchorRef = useRef<PageIndex | null>(null)

  // 네이티브 DnD 상태
  const [draggingIndex, setDraggingIndex] = useState<PageIndex | null>(null)
  const [overIndex, setOverIndex] = useState<PageIndex | null>(null)

  const handleSelectModified = useCallback(
    (index: PageIndex, modifier: SelectModifier) => {
      if (modifier === 'range') {
        const anchor = anchorRef.current ?? index
        selectRange(anchor, index)
        // anchor는 유지 (연속 shift 클릭으로 범위 재조정 가능)
        return
      }
      if (modifier === 'toggle') {
        togglePageSelection(index)
        anchorRef.current = index
        return
      }
      // none: 단일 선택
      selectPages([index])
      anchorRef.current = index
    },
    [selectRange, togglePageSelection, selectPages],
  )

  const handleClick = useCallback(
    (index: PageIndex) => {
      setCurrentPage(index)
    },
    [setCurrentPage],
  )

  const handleRotate = useCallback(
    (index: PageIndex) => {
      void rotatePage(index, 90)
    },
    [rotatePage],
  )

  const handleDelete = useCallback(
    (index: PageIndex) => {
      onRequestDelete?.([index])
    },
    [onRequestDelete],
  )

  // ----- DnD 핸들러 (P1-7) -----
  const handleDragStart = useCallback((index: PageIndex) => {
    setDraggingIndex(index)
  }, [])

  const handleDragOver = useCallback((index: PageIndex) => {
    setOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null)
    setOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (targetIndex: PageIndex) => {
      const from = draggingIndex
      setDraggingIndex(null)
      setOverIndex(null)
      if (from == null || from === targetIndex) return
      void movePage(from, targetIndex)
    },
    [draggingIndex, movePage],
  )

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6 text-center text-xs text-muted-foreground">
        문서를 선택하면 페이지가 표시됩니다
      </div>
    )
  }

  const pages = activeDoc.pages.map((p) => ({
    ...p,
    selected: selectedPages.includes(p.index),
  }))

  return (
    <ScrollArea className="h-full">
      <div
        className="grid grid-cols-2 gap-2 p-2"
        role="listbox"
        aria-label="페이지 썸네일"
        aria-multiselectable
      >
        {pages.map((page) => {
          // 드롭 인디케이터: 드래그 출발 < 대상이면 'after', 아니면 'before'
          let dropIndicator: 'before' | 'after' | null = null
          if (
            draggingIndex != null &&
            overIndex === page.index &&
            draggingIndex !== page.index
          ) {
            dropIndicator = draggingIndex < page.index ? 'after' : 'before'
          }
          return (
            <PageThumbnail
              key={`${activeDoc.id}-${page.index}`}
              page={page}
              isActive={page.index === currentPageIndex}
              onClick={handleClick}
              onSelect={(idx, multi) =>
                handleSelectModified(idx, multi ? 'toggle' : 'none')
              }
              onSelectModified={handleSelectModified}
              onRotate={handleRotate}
              onDelete={handleDelete}
              onDragStartPage={handleDragStart}
              onDragEndPage={handleDragEnd}
              onDragOverPage={handleDragOver}
              onDropPage={handleDrop}
              draggingIndex={draggingIndex}
              dropIndicator={dropIndicator}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
