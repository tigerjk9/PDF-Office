'use client'

import { useState } from 'react'
import { Loader2, RotateCw, Trash2, GripVertical } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PageIndex, PageThumbnailProps } from '@/lib/types'

/** 클릭 시 어떤 수정자(modifier)가 눌렸는지 */
export type SelectModifier = 'none' | 'toggle' | 'range'

/**
 * UI 전용 확장 props.
 *
 * 공유 타입(`PageThumbnailProps`)의 `onSelect(index, multi: boolean)` 시그니처는
 * 동결되어 있어 변경할 수 없으므로, shift(범위) vs ctrl(토글) 구분과
 * 네이티브 DnD 콜백은 UI 전용 옵셔널 props로 추가한다.
 */
interface UiPageThumbnailProps extends PageThumbnailProps {
  /** 수정자 종류까지 전달하는 확장 선택 콜백 (P1-5) */
  onSelectModified?: (index: PageIndex, modifier: SelectModifier) => void
  // ----- 네이티브 HTML5 DnD (P1-7) -----
  /** 드래그 시작 */
  onDragStartPage?: (index: PageIndex) => void
  /** 드래그 끝(취소 포함) */
  onDragEndPage?: () => void
  /** 다른 썸네일 위로 드래그 진입 → 드롭 위치 인디케이터용 */
  onDragOverPage?: (index: PageIndex) => void
  /** 이 썸네일에 드롭 */
  onDropPage?: (index: PageIndex) => void
  /** 현재 드래그 중인 페이지 인덱스 (자신이면 반투명) */
  draggingIndex?: PageIndex | null
  /** 드롭 인디케이터를 그릴 위치('before' | 'after' | null) */
  dropIndicator?: 'before' | 'after' | null
}

/**
 * 단일 페이지 썸네일.
 *
 * 선택 UX (P1-5):
 *  - 일반 클릭 → 단일 선택 + 뷰어 이동
 *  - Ctrl/Cmd 클릭 → 토글
 *  - Shift 클릭 → anchor~현재 범위 선택
 *
 * 호버 시 회전/삭제 액션 버튼을 표출한다.
 * 드래그 핸들로 네이티브 HTML5 DnD 순서 변경을 지원한다 (P1-7).
 */
export function PageThumbnail({
  page,
  isActive,
  onClick,
  onSelect,
  onSelectModified,
  onRotate,
  onDelete,
  onDragStartPage,
  onDragEndPage,
  onDragOverPage,
  onDropPage,
  draggingIndex,
  dropIndicator,
}: UiPageThumbnailProps) {
  const [draggable, setDraggable] = useState(false)

  const emitSelect = (modifier: SelectModifier) => {
    if (onSelectModified) {
      onSelectModified(page.index, modifier)
      return
    }
    // 폴백: 공유 시그니처 (none=단일, 그 외=토글)
    onSelect(page.index, modifier !== 'none')
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      e.preventDefault()
      emitSelect('range')
      return
    }
    if (e.ctrlKey || e.metaKey) {
      emitSelect('toggle')
      return
    }
    // 일반 클릭: 단일 선택 + 뷰어 이동
    emitSelect('none')
    onClick(page.index)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (e.shiftKey) {
        emitSelect('range')
        return
      }
      if (e.ctrlKey || e.metaKey) {
        emitSelect('toggle')
        return
      }
      emitSelect('none')
      onClick(page.index)
    }
  }

  const isDragging = draggingIndex === page.index

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-1',
        isDragging && 'opacity-40',
      )}
      onDragOver={(e) => {
        if (draggingIndex == null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverPage?.(page.index)
      }}
      onDrop={(e) => {
        if (draggingIndex == null) return
        e.preventDefault()
        onDropPage?.(page.index)
      }}
    >
      {/* 드롭 위치 인디케이터 (P1-7) */}
      {dropIndicator === 'before' && (
        <span
          className="pointer-events-none absolute -left-1 top-0 z-10 h-full w-1 rounded bg-primary"
          aria-hidden
        />
      )}
      {dropIndicator === 'after' && (
        <span
          className="pointer-events-none absolute -right-1 top-0 z-10 h-full w-1 rounded bg-primary"
          aria-hidden
        />
      )}

      {/* 접근성: 내부에 회전/삭제 <button>이 있으므로 외곽은 button이 아닌
          role="button" div로 둔다 (button 중첩 = 잘못된 HTML / hydration 오류). */}
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          // Firefox는 데이터가 있어야 드래그가 시작됨
          e.dataTransfer.setData('text/plain', String(page.index))
          onDragStartPage?.(page.index)
        }}
        onDragEnd={() => {
          setDraggable(false)
          onDragEndPage?.()
        }}
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={`${page.index + 1}페이지`}
        aria-pressed={page.selected}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border bg-white text-xs transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          page.selected
            ? 'ring-2 ring-blue-500 ring-offset-1'
            : isActive
              ? 'border-primary/60'
              : 'border-gray-200 hover:border-primary/40',
        )}
      >
        {page.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.thumbnail}
            alt={`${page.index + 1}페이지 미리보기`}
            className="h-full w-full object-contain"
            draggable={false}
            style={
              page.rotation
                ? { transform: `rotate(${page.rotation}deg)` }
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-[10px]">불러오는 중...</span>
          </div>
        )}

        {/* 드래그 핸들 (P1-7) — 누른 상태에서만 draggable 활성화 */}
        {onDropPage && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`${page.index + 1}페이지 순서 이동 핸들`}
            className={cn(
              'absolute left-1 top-1 flex h-6 w-6 cursor-grab items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity active:cursor-grabbing',
              'group-hover:opacity-100 focus-within:opacity-100',
            )}
            onMouseDown={(e) => {
              e.stopPropagation()
              setDraggable(true)
            }}
            onTouchStart={() => setDraggable(true)}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}

        {/* 호버 액션 */}
        {(onRotate || onDelete) && (
          <div
            className={cn(
              'absolute right-1 top-1 flex flex-col gap-1 opacity-0 transition-opacity',
              'group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            {onRotate && (
              <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6 shadow"
                onClick={(e) => {
                  e.stopPropagation()
                  onRotate(page.index, 90)
                }}
                aria-label={`${page.index + 1}페이지 90도 회전`}
              >
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                size="icon"
                className="h-6 w-6 shadow"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(page.index)
                }}
                aria-label={`${page.index + 1}페이지 삭제`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {/* 페이지 번호 뱃지 */}
        <span
          className={cn(
            'absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white',
          )}
        >
          {page.index + 1}
        </span>
      </div>
    </div>
  )
}

export type { PageIndex }
