'use client'

import { useState } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
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
  // ----- 네이티브 HTML5 DnD (R2-5: 썸네일 전체 드래그) -----
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
  /** DnD 활성 여부(핸들러 바인딩됨) */
  reorderable?: boolean
}

/**
 * 단일 페이지 썸네일.
 *
 * 선택 UX (P1-5):
 *  - 일반 클릭 → 단일 선택 + 뷰어 이동
 *  - Ctrl/Cmd 클릭 → 토글
 *  - Shift 클릭 → anchor~현재 범위 선택
 *
 * 순서 변경 (R2-5):
 *  - 작은 그립 핸들 의존을 제거하고 **썸네일 컨테이너 자체를 항상 draggable** 로.
 *  - 네이티브 click 은 드래그가 발생하지 않으면 그대로 발화 → 클릭(선택)과
 *    드래그(이동)가 공존한다. cursor: grab/grabbing 으로 어포던스 제공.
 *  - 키보드 이동(툴바 화살표/move)은 별도 유지(a11y).
 *
 * 로딩 안정화 (R2-6):
 *  - page.width/height 로 종횡비 박스를 사전 예약 → 이미지 pop-in 시 그리드
 *    시프트 0. 썸네일 도착 전엔 절제된 스켈레톤, 도착 시 fade-in.
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
  reorderable = false,
}: UiPageThumbnailProps) {
  const [grabbing, setGrabbing] = useState(false)

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
  const canReorder = reorderable && !!onDropPage

  // 종횡비 사전 예약 (R2-6): 메타의 width/height(pt) 사용, 안전 폴백 3/4
  const ratio =
    page.width > 0 && page.height > 0
      ? `${page.width} / ${page.height}`
      : '3 / 4'

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center transition-opacity duration-fast',
        isDragging && 'opacity-35',
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
      {/* 페이지 사이 삽입 인디케이터 (R2-5) — 명확한 라인 + 도트 */}
      {dropIndicator === 'before' && (
        <span
          className="drop-line -left-1.5 top-0 h-full w-[3px]"
          aria-hidden
        />
      )}
      {dropIndicator === 'after' && (
        <span
          className="drop-line -right-1.5 top-0 h-full w-[3px]"
          aria-hidden
        />
      )}

      {/* 접근성: 내부에 회전/삭제 <button>이 있으므로 외곽은 button이 아닌
          role="button" div로 둔다 (button 중첩 = 잘못된 HTML / hydration 오류). */}
      <div
        role="button"
        tabIndex={0}
        draggable={canReorder}
        onDragStart={(e) => {
          if (!canReorder) return
          e.dataTransfer.effectAllowed = 'move'
          // Firefox는 데이터가 있어야 드래그가 시작됨
          e.dataTransfer.setData('text/plain', String(page.index))
          setGrabbing(true)
          onDragStartPage?.(page.index)
        }}
        onDragEnd={() => {
          setGrabbing(false)
          onDragEndPage?.()
        }}
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={`${page.index + 1}페이지${
          canReorder ? ' (드래그하여 순서 이동)' : ''
        }`}
        aria-pressed={page.selected}
        aria-current={isActive ? 'page' : undefined}
        style={{ aspectRatio: ratio }}
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-md border bg-background',
          'transition-[border-color,box-shadow,transform] duration-fast ease-out-quart',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          canReorder &&
            (grabbing ? 'cursor-grabbing' : 'cursor-grab'),
          page.selected
            ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
            : isActive
              ? 'border-primary/55 shadow-sm'
              : 'border-border hover:border-border-strong hover:shadow-sm',
        )}
      >
        {page.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.thumbnail}
            alt={`${page.index + 1}페이지 미리보기`}
            className="media-fade h-full w-full object-contain"
            draggable={false}
            style={
              page.rotation
                ? { transform: `rotate(${page.rotation}deg)` }
                : undefined
            }
          />
        ) : (
          // 절제된 스켈레톤 (R2-6) — 종횡비 박스가 이미 자리 → 시프트 0
          <div
            className="skeleton-shimmer h-full w-full"
            aria-label="미리보기 불러오는 중"
            role="img"
          />
        )}

        {/* 호버/포커스 액션 — 보조 동작은 진입 시 드러남(progressive disclosure) */}
        {(onRotate || onDelete) && (
          <div
            className={cn(
              'absolute right-1 top-1 flex flex-col gap-1 opacity-0 transition-opacity duration-fast',
              'group-focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            {onRotate && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-border bg-background/95 text-muted-foreground shadow-sm backdrop-blur-[1px] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation()
                  onRotate(page.index, 90)
                }}
                aria-label={`${page.index + 1}페이지 90도 회전`}
              >
                <RotateCw className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-destructive-soft-border bg-background/95 text-destructive shadow-sm backdrop-blur-[1px] transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(page.index)
                }}
                aria-label={`${page.index + 1}페이지 삭제`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* 페이지 번호 — 절제된 칩 */}
        <span
          className={cn(
            'absolute bottom-1 left-1 rounded-[4px] px-1.5 py-px text-2xs font-medium tabular-nums',
            page.selected || isActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-foreground/65 text-background',
          )}
        >
          {page.index + 1}
        </span>
      </div>
    </div>
  )
}

export type { PageIndex }
