'use client'

import { useCallback, useRef } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { PageThumbnail } from '@/components/pages/PageThumbnail'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { PageIndex } from '@/lib/types'

/**
 * 활성 문서의 페이지 썸네일 그리드.
 *
 * 선택 UX:
 *  - 단일 클릭: 해당 페이지 1개만 선택 + 뷰어로 이동
 *  - Cmd/Ctrl 클릭: 토글
 *  - Shift 클릭: 마지막 anchor ~ 현재 페이지 범위 선택
 */
export function PageGrid() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const selectPages = usePdfStore((s) => s.selectPages)
  const togglePageSelection = usePdfStore((s) => s.togglePageSelection)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const applyOperation = usePdfStore((s) => s.applyOperation)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)

  const anchorRef = useRef<PageIndex | null>(null)

  const handleSelect = useCallback(
    (index: PageIndex, multi: boolean) => {
      if (!multi) {
        selectPages([index])
        anchorRef.current = index
        return
      }
      // multi 클릭: shift는 범위, ctrl/meta는 토글
      // PageThumbnail에서 multi=true로 합쳐서 전달하므로,
      // 여기서는 단순 토글로 처리하고 shift 범위 처리는 키보드 이벤트로 분리할 수도 있다.
      togglePageSelection(index)
      anchorRef.current = index
    },
    [selectPages, togglePageSelection],
  )

  const handleClick = useCallback(
    (index: PageIndex) => {
      setCurrentPage(index)
    },
    [setCurrentPage],
  )

  const handleRotate = useCallback(
    (index: PageIndex, degrees: 90 | 180 | 270) => {
      if (!activeDoc) return
      void applyOperation({
        type: 'rotate',
        docId: activeDoc.id,
        pageIndex: index,
        degrees,
      })
    },
    [activeDoc, applyOperation],
  )

  const handleDelete = useCallback(
    (index: PageIndex) => {
      if (!activeDoc) return
      void applyOperation({
        type: 'delete',
        docId: activeDoc.id,
        pageIndices: [index],
      })
    },
    [activeDoc, applyOperation],
  )

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6 text-center text-xs text-muted-foreground">
        Select a document to see its pages
      </div>
    )
  }

  const pages = activeDoc.pages.map((p) => ({
    ...p,
    selected: selectedPages.includes(p.index),
  }))

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-2 gap-2 p-2" role="listbox" aria-label="Page thumbnails">
        {pages.map((page) => (
          <PageThumbnail
            key={`${activeDoc.id}-${page.index}`}
            page={page}
            isActive={page.index === currentPageIndex}
            onClick={handleClick}
            onSelect={handleSelect}
            onRotate={handleRotate}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
