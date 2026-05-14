'use client'

import { Loader2, RotateCw, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PageIndex, PageThumbnailProps } from '@/lib/types'

/**
 * 단일 페이지 썸네일.
 *
 * 선택 상태:
 *  - 일반 클릭 → onSelect(idx, multi=false): 단일 선택
 *  - Cmd/Ctrl 클릭 → onSelect(idx, multi=true): 토글
 *  - 일반 클릭 (이미 활성 페이지인 경우) → onClick: 뷰어로 이동
 *
 * 호버 시 회전/삭제 액션 버튼을 표출한다.
 */
export function PageThumbnail({
  page,
  isActive,
  onClick,
  onSelect,
  onRotate,
  onDelete,
}: PageThumbnailProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const multi = e.ctrlKey || e.metaKey || e.shiftKey
    if (multi) {
      onSelect(page.index, true)
      return
    }
    // 일반 클릭: 선택 + 뷰어 이동
    onSelect(page.index, false)
    onClick(page.index)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(page.index, false)
      onClick(page.index)
    }
  }

  return (
    <div className="group relative flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={`Page ${page.index + 1}`}
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
            alt={`Thumbnail of page ${page.index + 1}`}
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
            <span className="text-[10px]">loading...</span>
          </div>
        )}

        {/* hover actions */}
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
                aria-label={`Rotate page ${page.index + 1} 90 degrees`}
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
                aria-label={`Delete page ${page.index + 1}`}
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
      </button>
    </div>
  )
}

export type { PageIndex }
